import { Cron } from "croner";
import { listFeeds } from "./config.js";
import { runFeed } from "./orchestrator.js";
import type { FeedConfig, FeedRunResult } from "./types.js";

/** One croner job per enabled feed, keyed by feed id. */
const jobs = new Map<string, Cron>();

/** Feed ids currently mid-run (scheduled tick or manual refresh). */
const running = new Set<string>();

/** Schedule every enabled feed. Called once after initDb() on server start. */
export async function startFeedScheduler(): Promise<void> {
  const feeds = await listFeeds();
  for (const feed of feeds) rescheduleFeed(feed);
}

/** (Re)schedule a single feed after it is created or updated. */
export function rescheduleFeed(feed: FeedConfig): void {
  stopFeed(feed.id);
  if (!feed.enabled) return;
  try {
    const job = new Cron(
      feed.cron,
      // protect: skip a tick if the previous run is still going (a scrape can
      // outlast its interval).
      { name: feed.id, protect: true },
      async () => {
        await runFeedGuarded(feed.id);
      },
    );
    jobs.set(feed.id, job);
  } catch (err) {
    console.error(
      `[feeds] invalid cron "${feed.cron}" for ${feed.id}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

export function stopFeed(id: string): void {
  jobs.get(id)?.stop();
  jobs.delete(id);
}

/**
 * Runs a feed unless it is already running (scheduled tick or manual refresh).
 * Returns null when skipped so callers can report current status instead of
 * starting a duplicate run that would clobber the resume cursor.
 */
async function runFeedGuarded(id: string): Promise<FeedRunResult | null> {
  if (running.has(id)) return null;
  running.add(id);
  try {
    return await runFeed(id);
  } finally {
    running.delete(id);
  }
}

/** Trigger a feed immediately, independent of its schedule (manual refresh). */
export async function runFeedNow(id: string): Promise<FeedRunResult> {
  const result = await runFeedGuarded(id);
  if (result) return result;
  return { feedId: id, status: "running", written: 0, total: 0, error: null };
}
