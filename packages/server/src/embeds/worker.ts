import type { ReplicatedEmbedDoc } from "@aside/shared";
import { createHash } from "node:crypto";
import { embedsSync, fetchEmbedsByMessageId } from "../sync/embeds.js";
import { messagesSync } from "../sync/messages.js";
import { writeServerBatch } from "../sync/server-write.js";
import { getOpenGraph } from "./cache.js";
import { extractUrls } from "./extract.js";
import { hasPreview, type OgResult } from "./opengraph.js";

// How many messages we OpenGraph-fetch at once. Small: this is a personal,
// single-user server and fetches are network-bound.
const CONCURRENCY = 2;

// Messages waiting to be processed, and those mid-flight. Keeping a messageId out
// of `inFlight` while it runs gives us per-message serialization: a change that
// lands during a fetch re-queues the id, and we re-run it only after the current
// pass finishes — which is what makes the "abort if updatedAt changed" guard sound.
const pending = new Set<string>();
const inFlight = new Set<string>();
let active = 0;

/** Queue a message for OpenGraph extraction. Cheap and idempotent. */
export function enqueueEmbedExtraction(messageId: string): void {
  pending.add(messageId);
  drain();
}

function drain(): void {
  while (active < CONCURRENCY) {
    const messageId = nextEligible();
    if (!messageId) break;
    pending.delete(messageId);
    inFlight.add(messageId);
    active += 1;
    void processMessage(messageId)
      .catch((err) => {
        console.error(`[embeds] ${messageId} failed:`, err);
      })
      .finally(() => {
        inFlight.delete(messageId);
        active -= 1;
        drain();
      });
  }
}

function nextEligible(): string | undefined {
  for (const id of pending) {
    if (!inFlight.has(id)) return id;
  }
  return undefined;
}

/** Fields that decide whether an embed is worth rewriting (ignores timestamps). */
interface DesiredEmbed {
  id: string;
  messageId: string;
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

async function processMessage(messageId: string): Promise<void> {
  const message = await messagesSync.fetchById(messageId);
  const live = message && !message._deleted;
  const urls = live ? extractUrls(message.text) : [];
  const sourceUpdatedAt = live ? message.updatedAt : 0;

  // The slow part: fetch (cached) OpenGraph for each URL still in the message.
  const desired: DesiredEmbed[] = [];
  for (const url of urls) {
    const og = await getOpenGraph(url);
    if (og.status === "ok" && hasPreview(og.result)) {
      desired.push(toDesired(messageId, url, og.result));
    }
  }

  // Staleness guard (the race the user called out): if the message was edited or
  // deleted while we were fetching, its updatedAt has moved — abort and let the
  // job that the edit already queued attach the preview for the new text.
  if (live) {
    const fresh = await messagesSync.fetchById(messageId);
    if (!fresh || fresh._deleted || fresh.updatedAt !== sourceUpdatedAt) return;
  }

  await reconcile(messageId, new Set(urls), desired, sourceUpdatedAt);
}

/**
 * Brings the stored embeds for a message in line with `desired`: upsert previews
 * whose content changed, soft-delete previews whose URL left the message. URLs
 * still present but not in `desired` (a fetch that failed this round) are left
 * untouched, so a transient failure doesn't flicker an existing card away. The
 * whole set goes out in one {@link writeServerBatch} (single SSE event).
 */
async function reconcile(
  messageId: string,
  urlSet: Set<string>,
  desired: DesiredEmbed[],
  sourceUpdatedAt: number,
): Promise<void> {
  const existing = await fetchEmbedsByMessageId(messageId);
  const existingById = new Map(existing.map((e) => [e.id, e]));
  const desiredIds = new Set(desired.map((d) => d.id));
  const now = Date.now();
  const batch: ReplicatedEmbedDoc[] = [];

  for (const d of desired) {
    const prev = existingById.get(d.id);
    const doc: ReplicatedEmbedDoc = {
      ...d,
      sourceUpdatedAt,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      _deleted: false,
    };
    if (!prev || !sameContent(prev, doc)) batch.push(doc);
  }

  for (const e of existing) {
    if (e._deleted) continue; // already gone
    if (desiredIds.has(e.id)) continue; // refreshed above
    if (urlSet.has(e.url)) continue; // URL still in the note; keep on a failed fetch
    batch.push({ ...e, updatedAt: now, _deleted: true });
  }

  await writeServerBatch(embedsSync, batch);
}

/** Content equality ignoring timestamps, so an unchanged preview isn't rewritten
 * (which would burn a seq and a pointless pull on every message edit). */
function sameContent(a: ReplicatedEmbedDoc, b: ReplicatedEmbedDoc): boolean {
  return (
    a.url === b.url &&
    a.title === b.title &&
    a.description === b.description &&
    a.image === b.image &&
    a.siteName === b.siteName &&
    a._deleted === b._deleted
  );
}

function toDesired(
  messageId: string,
  url: string,
  result: OgResult,
): DesiredEmbed {
  return {
    id: `${messageId}:${shortHash(url)}`,
    messageId,
    url,
    ...(result.title ? { title: result.title } : {}),
    ...(result.description ? { description: result.description } : {}),
    ...(result.image ? { image: result.image } : {}),
    ...(result.siteName ? { siteName: result.siteName } : {}),
  };
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}
