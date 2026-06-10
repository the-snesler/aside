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
 * Attachment metadata, synced through the same protocol as messages/channels
 * (hence `seq`/`deleted`). The bytes themselves live in the blob store, not
 * here; this row just links a message to a blob by hash.
 */
export interface AttachmentsTable {
  id: string;
  message_id: string;
  /** sha256 hex — the content-addressed key into the blob store */
  blob_hash: string;
  file_name: string;
  mime_type: string;
  size: number;
  created_at: number;
  updated_at: number;
  /** server-owned replication cursor */
  seq: number;
  /** 0 | 1 — SQLite has no native boolean */
  deleted: number;
}

/**
 * Server-only blob metadata. NOT synced (no `seq`/`deleted`) — it backs the
 * download endpoint's `Content-Type` and seeds future GC/refcounting. The bytes
 * live in the blob store keyed by `hash`; the client reaches them over the
 * separate `/api/blobs/:hash` route, not the sync stream.
 */
export interface BlobsTable {
  /** sha256 hex content address (primary key) */
  hash: string;
  content_type: string;
  size: number;
  created_at: number;
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
  attachments: AttachmentsTable;
  blobs: BlobsTable;
  feed_sources: FeedSourcesTable;
}
