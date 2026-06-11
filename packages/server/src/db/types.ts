/**
 * Kysely table interfaces. Column names are snake_case to keep the SQL in the
 * common SQLite/Postgres subset; the sync layer maps to/from the camelCase
 * MessageDoc contract in sync/row.ts.
 */
export interface MessagesTable {
  id: string;
  channel_id: string;
  text: string;
  created_at: number;
  updated_at: number;
  /** server-owned replication cursor */
  seq: number;
  /** 0 | 1 — SQLite has no native boolean */
  deleted: number;
}

export interface ChannelsTable {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  /** server-owned replication cursor */
  seq: number;
  /** 0 | 1 — SQLite has no native boolean */
  deleted: number;
}

/**
 * OpenGraph link-preview sidecars (OG-1/OG-2). Synced like messages/channels —
 * server-owned `seq` cursor + soft-delete flag — but written only by the server
 * (the extraction worker); clients read them. `message_id` joins back to the
 * message; the OpenGraph columns are nullable because a fetch may resolve only
 * some of them. The sync layer maps these to/from the camelCase EmbedDoc
 * contract in sync/row.ts.
 */
export interface EmbedsTable {
  id: string;
  message_id: string;
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  site_name: string | null;
  /** the message updated_at this embed was derived from; staleness guard */
  source_updated_at: number;
  created_at: number;
  updated_at: number;
  /** server-owned replication cursor */
  seq: number;
  /** 0 | 1 — SQLite has no native boolean */
  deleted: number;
}

/**
 * Server-only cache of fetched OpenGraph metadata, keyed by URL so the same link
 * across many messages (e.g. a feed importing duplicates) is fetched once. NOT
 * synced — like {@link FeedSourcesTable}, it has no `seq`/`deleted`. `payload` is
 * the JSON-encoded {@link OgResult}; `status` distinguishes a successful fetch
 * from a cached failure (negative cache) so a dead URL isn't retried on a loop.
 */
export interface OgCacheTable {
  /** the fetched URL (primary key) */
  url: string;
  /** "ok" | "error" */
  status: string;
  /** JSON-encoded normalized OpenGraph result, or null on failure */
  payload: string | null;
  /** ms epoch the fetch completed; drives TTL */
  fetched_at: number;
}

/**
 * Server-only feed configuration. NOT synced through RxDB — credentials and
 * per-source state must never enter the sync stream — so it has no `seq`/
 * `deleted`. `config` and `cursor` are JSON-encoded text blobs.
 */
export interface FeedSourcesTable {
  id: string;
  /** source kind, e.g. "twitter-bookmarks" */
  type: string;
  /** target channel this feed writes notes into */
  channel_id: string;
  /** slug name used when the channel must be auto-created */
  channel_name: string;
  /** cron expression driving the schedule */
  cron: string;
  /** 0 | 1 */
  enabled: number;
  /** source-specific options, JSON */
  config: string;
  /** opaque resume marker, JSON, or null before the first run */
  cursor: string | null;
  last_run_at: number | null;
  /** "ok" | "running" | "auth_required" | "error" */
  last_status: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface Database {
  messages: MessagesTable;
  channels: ChannelsTable;
  embeds: EmbedsTable;
  og_cache: OgCacheTable;
  feed_sources: FeedSourcesTable;
}
