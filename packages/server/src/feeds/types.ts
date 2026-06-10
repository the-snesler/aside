/**
 * The feeds subsystem: channels that auto-populate with notes pulled from an
 * external source. The first source is the user's Twitter/X bookmarks, but the
 * shapes here are source-agnostic so RSS and others can slot in later.
 */

export type FeedStatus = "ok" | "running" | "auth_required" | "error";

/** Opaque, source-defined resume marker persisted between runs. */
export type FeedCursor = Record<string, unknown>;

/** A decoded feed_sources row. */
export interface FeedConfig {
  id: string;
  type: string;
  channelId: string;
  channelName: string;
  cron: string;
  enabled: boolean;
  /** source-specific options (e.g. `{ maxItems: 200 }`) */
  options: Record<string, unknown>;
  cursor: FeedCursor | null;
  lastRunAt: number | null;
  lastStatus: FeedStatus | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

/** One item pulled from a source, before it becomes a note. */
export interface FeedItem {
  /** stable external id; combined with the source's idPrefix to form the note id */
  externalId: string;
  /** the note body (for now: the source URL, optionally prefixed with item text) */
  text: string;
  /** canonical url of the item */
  url: string;
  /** ms epoch of the item's own timestamp */
  createdAt: number;
}

export interface FeedFetchResult {
  items: FeedItem[];
  cursor: FeedCursor;
}

/** A pluggable external source. Registered by `type` in registry.ts. */
export interface FeedSource {
  /** matches FeedConfig.type and the feed_sources.type column */
  readonly type: string;
  /** note-id namespace, e.g. "tw" → note id `tw:<externalId>` */
  readonly idPrefix: string;
  /** Pull items since the feed's cursor and return a fresh cursor. */
  fetchItems(feed: FeedConfig): Promise<FeedFetchResult>;
}

/** Summary returned by a single feed run (scheduler tick or manual refresh). */
export interface FeedRunResult {
  feedId: string;
  status: FeedStatus;
  /** items newly written as notes this run */
  written: number;
  /** items the source returned (before dedup) */
  total: number;
  error: string | null;
}
