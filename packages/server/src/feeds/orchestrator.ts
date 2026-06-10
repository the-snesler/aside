import type { ReplicatedChannelDoc, ReplicatedMessageDoc } from "@aside/shared";
import { channelsSync } from "../sync/channels.js";
import { ingestNewBatch } from "../sync/ingest.js";
import { messagesSync } from "../sync/messages.js";
import { getFeed, saveRunResult } from "./config.js";
import { FeedAuthError } from "./errors.js";
import { getSource } from "./registry.js";
import type {
  FeedConfig,
  FeedItem,
  FeedRunResult,
  FeedSource,
} from "./types.js";

/**
 * Runs one feed end-to-end: pull items from its source, ensure the target
 * channel exists, turn items into notes, and ingest the new ones. All failures
 * are caught and recorded as status on the feed (never thrown), so a scheduler
 * tick can't crash the process and the UI always has a status to show.
 */
export async function runFeed(feedId: string): Promise<FeedRunResult> {
  const feed = await getFeed(feedId);
  if (!feed) {
    return {
      feedId,
      status: "error",
      written: 0,
      total: 0,
      error: "feed not found",
    };
  }
  const source = getSource(feed.type);
  if (!source) {
    const error = `unknown feed source "${feed.type}"`;
    await saveRunResult(feed.id, {
      status: "error",
      error,
      lastRunAt: Date.now(),
    });
    return { feedId, status: "error", written: 0, total: 0, error };
  }

  await saveRunResult(feed.id, { status: "running" });

  try {
    const { items, cursor } = await source.fetchItems(feed);
    await ensureChannel(feed);
    const docs = items.map((item) => itemToMessage(source, feed, item));
    const written = await ingestNewBatch(messagesSync, docs);
    await saveRunResult(feed.id, {
      cursor,
      status: "ok",
      error: null,
      lastRunAt: Date.now(),
    });
    return {
      feedId,
      status: "ok",
      written: written.length,
      total: items.length,
      error: null,
    };
  } catch (err) {
    const status = err instanceof FeedAuthError ? "auth_required" : "error";
    const error = err instanceof Error ? err.message : String(err);
    await saveRunResult(feed.id, { status, error, lastRunAt: Date.now() });
    console.error(`[feeds] run failed for ${feed.id} (${feed.type}): ${error}`);
    return { feedId, status, written: 0, total: 0, error };
  }
}

/** Auto-create the feed's channel (live to clients) if it isn't there yet. */
async function ensureChannel(feed: FeedConfig): Promise<void> {
  const existing = await channelsSync.fetchById(feed.channelId);
  if (existing) return;
  const now = Date.now();
  const channel: ReplicatedChannelDoc = {
    id: feed.channelId,
    name: feed.channelName,
    createdAt: now,
    updatedAt: now,
    _deleted: false,
  };
  await ingestNewBatch(channelsSync, [channel]);
}

function itemToMessage(
  source: FeedSource,
  feed: FeedConfig,
  item: FeedItem,
): ReplicatedMessageDoc {
  return {
    // Deterministic id → idempotent re-ingest; ingestNewBatch skips ids that
    // already exist, so edits/deletes by the user survive future runs.
    id: `${source.idPrefix}:${item.externalId}`,
    channelId: feed.channelId,
    text: item.text,
    createdAt: item.createdAt,
    updatedAt: Date.now(),
    _deleted: false,
  };
}
