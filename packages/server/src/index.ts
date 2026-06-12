import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { createAuthMiddleware, registerAuthRoutes } from "./auth/index.js";
import { getBlobDriver, sha256 } from "./blobs/index.js";
import { db, initDb } from "./db/index.js";
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
import {
  rescheduleFeed,
  runFeedNow,
  startFeedScheduler,
  stopFeed,
} from "./feeds/scheduler.js";
import { startEmbeds } from "./embeds/index.js";
import { attachmentsSync } from "./sync/attachments.js";
import { channelsSync } from "./sync/channels.js";
import type { ReplicatedDoc, SyncCollection } from "./sync/collection.js";
import { embedsSync } from "./sync/embeds.js";
import { messagesSync } from "./sync/messages.js";
import { pull } from "./sync/pull.js";
import { push, type PushRow } from "./sync/push.js";
import { onChange } from "./sync/stream.js";

const PORT = Number(process.env.PORT ?? 3001);
// Relative to cwd; the Docker runtime sets WORKDIR /app and STATIC_DIR=./public.
const STATIC_DIR = process.env.STATIC_DIR;

await initDb();

// Begin OpenGraph extraction: subscribe to message writes + backfill existing
// notes. Must run after initDb so the embeds seq counter is primed.
startEmbeds();

const app = new Hono();

app.use("/api/*", cors());

app.get("/health", (c) => c.json({ status: "ok" }));

registerAuthRoutes(app);
app.use("/api/*", createAuthMiddleware());

/**
 * Mounts the pull/push/stream trio for one collection under
 * `/api/sync/:collection/*`. Every synced collection goes through the same
 * generic handlers — the descriptor carries the table-specific behaviour.
 */
function registerSyncRoutes<TDoc extends ReplicatedDoc>(
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

registerSyncRoutes(messagesSync);
registerSyncRoutes(channelsSync);
registerSyncRoutes(embedsSync);
registerSyncRoutes(attachmentsSync);

/**
 * Blob bytes (ATT-2). Content-addressed by sha256 and kept OFF the RxDB sync
 * path — the heavy bytes travel over plain fetch, while the lightweight
 * attachment metadata rides the normal `attachments` sync stream. Uploads dedupe
 * on content hash; the `:hash` URL is immutable, so it caches forever.
 */
const MAX_BLOB_BYTES = 25 * 1024 * 1024;

app.post("/api/blobs", async (c) => {
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

/**
 * Feeds API. Server-only configuration (credentials, schedules, cursors), kept
 * off the RxDB sync path — the client talks to these over plain fetch. The
 * notes a feed produces still arrive on clients through the normal messages
 * stream.
 */
app.get("/api/feeds/sources", (c) => c.json(listSourceTypes()));

app.get("/api/feeds", async (c) => c.json(await listFeeds()));

app.post("/api/feeds", async (c) => {
  const input = await c.req.json<CreateFeedInput>();
  if (!input?.type || !input?.channelName) {
    return c.json({ error: "type and channelName are required" }, 400);
  }
  const feed = await createFeed(input);
  rescheduleFeed(feed);
  return c.json(feed, 201);
});

app.patch("/api/feeds/:id", async (c) => {
  const patch = await c.req.json<UpdateFeedInput>();
  const feed = await updateFeed(c.req.param("id"), patch);
  if (!feed) return c.json({ error: "not found" }, 404);
  rescheduleFeed(feed);
  return c.json(feed);
});

app.delete("/api/feeds/:id", async (c) => {
  const id = c.req.param("id");
  stopFeed(id);
  await deleteFeed(id);
  return c.json({ ok: true });
});

// Manual trigger — runs the feed now, independent of its schedule.
app.post("/api/feeds/:id/refresh", async (c) => {
  const id = c.req.param("id");
  if (!(await getFeed(id))) return c.json({ error: "not found" }, 404);
  return c.json(await runFeedNow(id));
});

// Seed/refresh the feed's auth: the body is the cookie array exported from the
// browser (e.g. "Get cookies.txt LOCALLY").
app.post("/api/feeds/:id/cookies", async (c) => {
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

// In prod the single container serves the built client from STATIC_DIR, with an
// SPA fallback to index.html for any non-API, non-file route.
if (STATIC_DIR) {
  app.use("/*", serveStatic({ root: STATIC_DIR }));
  app.get("/*", serveStatic({ path: "index.html", root: STATIC_DIR }));
}

// Schedule enabled feeds. Cron ticks fire on their own interval; nothing runs
// on boot, so startup stays fast.
await startFeedScheduler();

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`aside server listening on :${info.port}`);
});
