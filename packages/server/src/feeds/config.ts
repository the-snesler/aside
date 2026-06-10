import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import type { FeedSourcesTable } from "../db/types.js";
import type { FeedConfig, FeedCursor, FeedStatus } from "./types.js";

export interface CreateFeedInput {
  type: string;
  /** target channel id; a fresh uuid is generated when omitted */
  channelId?: string;
  /** channel display/handle; slugified server-side */
  channelName: string;
  cron?: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export interface UpdateFeedInput {
  channelName?: string;
  cron?: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

/** Default schedule: hourly. Frequent enough to stay fresh, gentle on scraping. */
const DEFAULT_CRON = "0 * * * *";

export async function listFeeds(): Promise<FeedConfig[]> {
  const rows = await db
    .selectFrom("feed_sources")
    .selectAll()
    .orderBy("created_at", "asc")
    .execute();
  return rows.map(rowToConfig);
}

export async function getFeed(id: string): Promise<FeedConfig | null> {
  const row = await db
    .selectFrom("feed_sources")
    .selectAll()
    .where("id", "=", id)
    .executeTakeFirst();
  return row ? rowToConfig(row) : null;
}

export async function createFeed(input: CreateFeedInput): Promise<FeedConfig> {
  const now = Date.now();
  const row: FeedSourcesTable = {
    id: randomUUID(),
    type: input.type,
    channel_id: input.channelId ?? randomUUID(),
    channel_name: slugifyChannelName(input.channelName),
    cron: input.cron?.trim() || DEFAULT_CRON,
    enabled: input.enabled === false ? 0 : 1,
    config: JSON.stringify(input.options ?? {}),
    cursor: null,
    last_run_at: null,
    last_status: null,
    last_error: null,
    created_at: now,
    updated_at: now,
  };
  await db.insertInto("feed_sources").values(row).execute();
  return rowToConfig(row);
}

export async function updateFeed(
  id: string,
  patch: UpdateFeedInput,
): Promise<FeedConfig | null> {
  const set: Partial<FeedSourcesTable> = { updated_at: Date.now() };
  if (patch.channelName !== undefined)
    set.channel_name = slugifyChannelName(patch.channelName);
  if (patch.cron !== undefined) set.cron = patch.cron.trim() || DEFAULT_CRON;
  if (patch.enabled !== undefined) set.enabled = patch.enabled ? 1 : 0;
  if (patch.options !== undefined) set.config = JSON.stringify(patch.options);

  await db.updateTable("feed_sources").set(set).where("id", "=", id).execute();
  return getFeed(id);
}

export async function deleteFeed(id: string): Promise<void> {
  await db.deleteFrom("feed_sources").where("id", "=", id).execute();
}

/** Persists the outcome of a run: new cursor (when given), status, error, time. */
export async function saveRunResult(
  id: string,
  result: {
    cursor?: FeedCursor | null;
    status: FeedStatus;
    error?: string | null;
    lastRunAt?: number;
  },
): Promise<void> {
  const set: Partial<FeedSourcesTable> = {
    last_status: result.status,
    updated_at: Date.now(),
  };
  if (result.cursor !== undefined)
    set.cursor = result.cursor === null ? null : JSON.stringify(result.cursor);
  if (result.error !== undefined) set.last_error = result.error;
  if (result.lastRunAt !== undefined) set.last_run_at = result.lastRunAt;

  await db.updateTable("feed_sources").set(set).where("id", "=", id).execute();
}

function rowToConfig(row: FeedSourcesTable): FeedConfig {
  return {
    id: row.id,
    type: row.type,
    channelId: row.channel_id,
    channelName: row.channel_name,
    cron: row.cron,
    enabled: row.enabled === 1,
    options: parseJson(row.config, {}) as Record<string, unknown>,
    cursor: row.cursor
      ? (parseJson(row.cursor, null) as FeedCursor | null)
      : null,
    lastRunAt: row.last_run_at,
    lastStatus: (row.last_status as FeedStatus | null) ?? null,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseJson(raw: string, fallback: unknown): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * Channel names double as `#tag` handles, so they are kept slug-like — mirrors
 * the client's slugifyChannelName so an auto-created feed channel matches the
 * shape the UI produces.
 */
function slugifyChannelName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}
