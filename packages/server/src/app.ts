import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import {
  getAiConfigPublic,
  updateAiConfig,
  type AiProvider,
  type UpdateAiConfigInput,
} from "./ai/config.js";
import {
  backfillOrganize,
  redescribeAll,
  reinitAmbientAi,
} from "./ai/index.js";
import { createAuthMiddleware, registerAuthRoutes } from "./auth/index.js";
import { getBlobDriver, sha256 } from "./blobs/index.js";
import { runBlobGc } from "./blobs/gc.js";
import {
  clampThumbnailWidth,
  getOrCreateThumbnail,
} from "./blobs/thumbnails.js";
import { db } from "./db/index.js";
import {
  DEMO_WRITABLE_COLLECTIONS,
  demoForbidden,
  isDemoMode,
} from "./demo/index.js";
import { getStorageUsage } from "./storage/usage.js";
import {
  createFeed,
  deleteFeed,
  getFeed,
  listFeeds,
  updateFeed,
  type CreateFeedInput,
  type UpdateFeedInput,
} from "./feeds/config.js";
import { saveFeedCookies } from "./feeds/cookies.js";
import { listSourceTypes } from "./feeds/registry.js";
import { rescheduleFeed, runFeedNow, stopFeed } from "./feeds/scheduler.js";
import {
  deleteSubscription,
  getNotificationStatus,
  pushSubscriptionSchema,
  saveSubscription,
} from "./notifications/push.js";
import { attachmentsSync } from "./sync/attachments.js";
import { channelsSync } from "./sync/channels.js";
import type { ReplicatedDoc, SyncCollection } from "./sync/collection.js";
import { configSync } from "./sync/config.js";
import { embedsSync } from "./sync/embeds.js";
import { messagesSync } from "./sync/messages.js";
import { pull } from "./sync/pull.js";
import { push, type PushRow } from "./sync/push.js";
import { attachmentRowToDoc } from "./sync/row.js";
import { writeServerBatch } from "./sync/server-write.js";
import { onChange } from "./sync/stream.js";

// Relative to cwd; the Docker runtime sets WORKDIR /app and STATIC_DIR=./public.
const STATIC_DIR = process.env.STATIC_DIR;

const MAX_BLOB_BYTES = 25 * 1024 * 1024;

const AI_PROVIDERS = new Set<AiProvider>([
  "anthropic",
  "openai",
  "openai-compatible",
]);

/**
 * Builds the Hono app with every route mounted, but starts no background work
 * (schedulers, embed/AI workers) and binds no port — that bootstrap lives in
 * `index.ts`. Keeping construction side-effect-free lets tests drive the real
 * routing/auth/sync wiring in-process via `app.request(...)`.
 */
export function createApp(): Hono {
  const app = new Hono();

  app.use("/api/*", cors());

  app.get("/health", (c) => c.json({ status: "ok" }));

  registerAuthRoutes(app);
  app.use("/api/*", createAuthMiddleware());

  registerSyncRoutes(app, messagesSync);
  registerSyncRoutes(app, channelsSync);
  registerSyncRoutes(app, embedsSync);
  registerSyncRoutes(app, attachmentsSync);
  registerSyncRoutes(app, configSync);

  registerBlobRoutes(app);
  registerStorageRoutes(app);
  registerFeedRoutes(app);
  registerAiRoutes(app);
  registerNotificationRoutes(app);

  // In prod the single container serves the built client from STATIC_DIR, with
  // an SPA fallback to index.html for any non-API, non-file route.
  if (STATIC_DIR) {
    app.use("/*", serveStatic({ root: STATIC_DIR }));
    app.get("/*", serveStatic({ path: "index.html", root: STATIC_DIR }));
  }

  return app;
}

function registerNotificationRoutes(app: Hono): void {
  app.get("/api/notifications/status", async (c) => {
    const endpoint = c.req.query("endpoint");
    return c.json(await getNotificationStatus(endpoint));
  });

  app.post("/api/notifications/subscribe", async (c) => {
    const body = pushSubscriptionSchema.parse(await c.req.json());
    await saveSubscription(body, c.req.header("user-agent") ?? null);
    return c.json({ ok: true });
  });

  app.post("/api/notifications/unsubscribe", async (c) => {
    const body = await c.req.json<{ endpoint?: string }>();
    if (body.endpoint) await deleteSubscription(body.endpoint);
    return c.json({ ok: true });
  });
}

/**
 * Mounts the pull/push/stream trio for one collection under
 * `/api/sync/:collection/*`. Every synced collection goes through the same
 * generic handlers — the descriptor carries the table-specific behaviour.
 */
function registerSyncRoutes<TDoc extends ReplicatedDoc>(
  app: Hono,
  coll: SyncCollection<TDoc>,
): void {
  const base = `/api/sync/${coll.name}`;

  // Pull: client sends its checkpoint, gets back changed docs + a new checkpoint.
  app.post(`${base}/pull`, async (c) => {
    const body = await c.req.json<{
      checkpoint?: { seq: number } | null;
      batchSize?: number;
    }>();
    const result = await pull(coll, {
      checkpoint: body.checkpoint ?? null,
      batchSize: body.batchSize ?? 100,
    });
    return c.json(result);
  });

  // Push: client sends changed docs; server returns conflicting master docs.
  app.post(`${base}/push`, async (c) => {
    // In the demo, only the core collections are writable; attachments/embeds
    // pushes are rejected (uploads are off; embeds are server-owned anyway).
    if (isDemoMode() && !DEMO_WRITABLE_COLLECTIONS.has(coll.name)) {
      return demoForbidden(c);
    }
    const rows = await c.req.json<PushRow<TDoc>[]>();
    const conflicts = await push(coll, rows);
    return c.json(conflicts);
  });

  // Stream: SSE feed of this collection's changes, so a second instance updates live.
  app.get(`${base}/stream`, (c) => {
    return streamSSE(c, async (stream) => {
      let closed = false;
      const unsub = onChange(coll.name, (event) => {
        void stream.writeSSE({ data: JSON.stringify(event) }).catch(() => {});
      });
      stream.onAbort(() => {
        closed = true;
        unsub();
      });
      // Keep the connection alive through proxies with a periodic comment ping.
      while (!closed) {
        await stream.writeSSE({ event: "ping", data: String(Date.now()) });
        await stream.sleep(15000);
      }
    });
  });
}

/**
 * Blob bytes (ATT-2). Content-addressed by sha256 and kept OFF the RxDB sync
 * path — the heavy bytes travel over plain fetch, while the lightweight
 * attachment metadata rides the normal `attachments` sync stream. Uploads dedupe
 * on content hash; the `:hash` URL is immutable, so it caches forever.
 */
function registerBlobRoutes(app: Hono): void {
  app.post("/api/blobs", async (c) => {
    // Uploads are disabled in the demo: kills the bad/large-content risk class.
    if (isDemoMode()) return demoForbidden(c);
    const declared = Number(c.req.header("content-length") ?? 0);
    if (declared > MAX_BLOB_BYTES) {
      return c.json({ error: "file too large" }, 413);
    }
    const buf = Buffer.from(await c.req.arrayBuffer());
    if (buf.byteLength === 0) {
      return c.json({ error: "empty body" }, 400);
    }
    if (buf.byteLength > MAX_BLOB_BYTES) {
      return c.json({ error: "file too large" }, 413);
    }

    const contentType =
      c.req.header("content-type") || "application/octet-stream";
    const hash = sha256(buf);
    // Content-addressed: put() is a no-op if the bytes are already stored.
    await getBlobDriver().put(hash, buf);
    await db
      .insertInto("blobs")
      .values({
        hash,
        content_type: contentType,
        size: buf.byteLength,
        created_at: Date.now(),
      })
      .onConflict((oc) => oc.column("hash").doNothing())
      .execute();

    return c.json({ hash, size: buf.byteLength }, 201);
  });

  app.get("/api/blobs/:hash", async (c) => {
    const hash = c.req.param("hash");
    const meta = await db
      .selectFrom("blobs")
      .selectAll()
      .where("hash", "=", hash)
      .executeTakeFirst();
    if (!meta) return c.json({ error: "not found" }, 404);

    const bytes = await getBlobDriver().get(hash);
    if (!bytes) return c.json({ error: "not found" }, 404);

    // Copy into a fresh Uint8Array so the body type satisfies BodyInit (a Node
    // Buffer is backed by ArrayBufferLike, which the web Response type rejects).
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": meta.content_type,
        "content-length": String(meta.size),
        // The URL is the content hash, so the bytes can never change.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  });

  // A resized WebP preview of an image blob, generated and cached on first hit
  // (ATT-4). `?w=` snaps to a small allowlist of widths. Non-image / undecodable
  // sources redirect to the original so an `<img>` still resolves.
  app.get("/api/blobs/:hash/thumbnail", async (c) => {
    const hash = c.req.param("hash");
    const width = clampThumbnailWidth(Number(c.req.query("w")));
    const thumb = await getOrCreateThumbnail(hash, width);
    if (!thumb) return c.redirect(`/api/blobs/${hash}`, 302);

    return new Response(new Uint8Array(thumb.bytes), {
      headers: {
        "content-type": thumb.contentType,
        "content-length": String(thumb.bytes.byteLength),
        // Keyed by the source hash + a fixed width set, so this is immutable too.
        "cache-control": "public, max-age=31536000, immutable",
      },
    });
  });
}

/**
 * Storage API. Read-only usage breakdown plus a bulk-delete used by the Storage
 * settings page. Deletes are applied server-authoritatively so every client
 * converges through the normal attachments sync stream, then orphaned blobs are
 * swept right away so reclaimed space shows up immediately.
 */
function registerStorageRoutes(app: Hono): void {
  app.get("/api/storage/usage", async (c) => c.json(await getStorageUsage()));

  app.post("/api/storage/attachments/delete", async (c) => {
    if (isDemoMode()) return demoForbidden(c);
    const body = await c.req
      .json<{ ids?: string[] }>()
      .catch(() => ({}) as { ids?: string[] });
    const ids = Array.isArray(body.ids)
      ? body.ids.filter((id): id is string => typeof id === "string")
      : [];
    if (ids.length === 0) return c.json({ deleted: 0, bytesReclaimed: 0 });

    const rows = await db
      .selectFrom("attachments")
      .selectAll()
      .where("id", "in", ids)
      .where("deleted", "=", 0)
      .execute();

    const now = Date.now();
    const docs = rows.map((row) => ({
      ...attachmentRowToDoc(row),
      updatedAt: now,
      _deleted: true,
    }));
    await writeServerBatch(attachmentsSync, docs);

    // Reclaim the blobs those attachments were pinning (subject to the GC grace
    // period; very recent uploads are caught by the next scheduled sweep).
    const gc = await runBlobGc();
    return c.json({ deleted: docs.length, bytesReclaimed: gc.bytesReclaimed });
  });
}

/**
 * Feeds API. Server-only configuration (credentials, schedules, cursors), kept
 * off the RxDB sync path — the client talks to these over plain fetch. The
 * notes a feed produces still arrive on clients through the normal messages
 * stream.
 */
function registerFeedRoutes(app: Hono): void {
  app.get("/api/feeds/sources", (c) => c.json(listSourceTypes()));

  app.get("/api/feeds", async (c) => c.json(await listFeeds()));

  app.post("/api/feeds", async (c) => {
    if (isDemoMode()) return demoForbidden(c);
    const input = await c.req.json<CreateFeedInput>();
    if (!input?.type || !input?.channelName) {
      return c.json({ error: "type and channelName are required" }, 400);
    }
    const feed = await createFeed(input);
    rescheduleFeed(feed);
    return c.json(feed, 201);
  });

  app.patch("/api/feeds/:id", async (c) => {
    if (isDemoMode()) return demoForbidden(c);
    const patch = await c.req.json<UpdateFeedInput>();
    const feed = await updateFeed(c.req.param("id"), patch);
    if (!feed) return c.json({ error: "not found" }, 404);
    rescheduleFeed(feed);
    return c.json(feed);
  });

  app.delete("/api/feeds/:id", async (c) => {
    if (isDemoMode()) return demoForbidden(c);
    const id = c.req.param("id");
    stopFeed(id);
    await deleteFeed(id);
    return c.json({ ok: true });
  });

  // Manual trigger — runs the feed now, independent of its schedule.
  app.post("/api/feeds/:id/refresh", async (c) => {
    if (isDemoMode()) return demoForbidden(c);
    const id = c.req.param("id");
    if (!(await getFeed(id))) return c.json({ error: "not found" }, 404);
    return c.json(await runFeedNow(id));
  });

  // Seed/refresh the feed's auth: the body is the cookie array exported from the
  // browser (e.g. "Get cookies.txt LOCALLY").
  app.post("/api/feeds/:id/cookies", async (c) => {
    if (isDemoMode()) return demoForbidden(c);
    const id = c.req.param("id");
    if (!(await getFeed(id))) return c.json({ error: "not found" }, 404);
    try {
      saveFeedCookies(id, await c.req.json());
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : String(err) },
        400,
      );
    }
    return c.json({ ok: true });
  });
}

/**
 * Ambient AI API. Server-only config (provider, model, base URL, API key) kept
 * off the RxDB sync path — the key must never reach a client, so GET masks it as
 * a `hasApiKey` flag. The notes/channels the bots edit still reach clients
 * through the normal sync streams.
 */
function registerAiRoutes(app: Hono): void {
  app.get("/api/ai/config", async (c) => c.json(await getAiConfigPublic()));

  app.patch("/api/ai/config", async (c) => {
    if (isDemoMode()) return demoForbidden(c);
    const body = await c.req.json<UpdateAiConfigInput>().catch(() => ({}));
    await updateAiConfig(sanitizeAiPatch(body));
    // Re-apply: restart the describer cron and backfill if a bot was just enabled.
    await reinitAmbientAi();
    return c.json(await getAiConfigPublic());
  });

  // Manual triggers, independent of the live stream / cron.
  app.post("/api/ai/reorganize", async (c) => {
    if (isDemoMode()) return demoForbidden(c);
    await backfillOrganize();
    return c.json({ ok: true });
  });

  app.post("/api/ai/redescribe", async (c) => {
    if (isDemoMode()) return demoForbidden(c);
    void redescribeAll();
    return c.json({ ok: true });
  });
}

function sanitizeAiPatch(body: UpdateAiConfigInput): UpdateAiConfigInput {
  const patch: UpdateAiConfigInput = {};
  if (typeof body.organizerEnabled === "boolean")
    patch.organizerEnabled = body.organizerEnabled;
  if (typeof body.describerEnabled === "boolean")
    patch.describerEnabled = body.describerEnabled;
  if (
    typeof body.provider === "string" &&
    AI_PROVIDERS.has(body.provider as AiProvider)
  )
    patch.provider = body.provider as AiProvider;
  if (typeof body.model === "string") patch.model = body.model;
  if (typeof body.baseUrl === "string" || body.baseUrl === null)
    patch.baseUrl = body.baseUrl;
  if (typeof body.apiKey === "string" || body.apiKey === null)
    patch.apiKey = body.apiKey;
  if (typeof body.describeCron === "string")
    patch.describeCron = body.describeCron;
  if (body.options && typeof body.options === "object")
    patch.options = body.options as Record<string, unknown>;
  return patch;
}
