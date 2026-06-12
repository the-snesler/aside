/**
 * Kysely table interfaces. Column names are snake_case to keep the SQL in the
 * common SQLite/Postgres subset; the sync layer maps to/from the camelCase
 * MessageDoc contract in sync/row.ts.
 */
export interface MessagesTable {
  id: string;
  channel_id: string;
  channel_ids: string | null;
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
  /** short channel summary, maintained by the AI describer; null when unset */
  description: string | null;
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
 * Synced key-value app config (today: the UI theme). Goes through the same
 * protocol as messages/channels — server-owned `seq` cursor + soft-delete flag.
 * `value` is an opaque JSON string the sync layer passes through untouched.
 */
export interface ConfigTable {
  id: string;
  value: string;
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

/**
 * Server-only ambient-AI configuration. NOT synced (no `seq`/`deleted`) — it
 * holds the LLM provider/model and the API key, which must never enter the sync
 * stream. Exactly one row is expected, keyed by {@link AI_CONFIG_ID}.
 */
export interface AiConfigTable {
  id: string;
  /** 0 | 1 — master switch for the organizer bot (auto-tagging) */
  organizer_enabled: number;
  /** 0 | 1 — switch for the describer bot (channel descriptions) */
  describer_enabled: number;
  /** "anthropic" | "openai" | "openai-compatible" */
  provider: string;
  /** model id, e.g. "claude-haiku-4-5" */
  model: string;
  /** base URL for openai-compatible / self-hosted endpoints; null otherwise */
  base_url: string | null;
  /** LLM API key; null falls back to the provider's env var */
  api_key: string | null;
  /** cron driving the describer sweep */
  describe_cron: string;
  /** reserved for source-specific options, JSON */
  options: string;
  /** "ok" | "error" | null */
  last_status: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Server-only per-message organizer state. NOT synced. Breaks the organizer's
 * write→onChange feedback loop: keyed by `message_id`, it records the hash of the
 * text we last classified, so the worker re-runs only when the *text* changes —
 * not when its own channel-id write fans back through `onChange("messages")`.
 */
export interface AiMessageStateTable {
  message_id: string;
  /** hash of the message text the last classification was derived from */
  text_hash: string;
  /** JSON array of channel ids the organizer added (to detect user overrides) */
  assigned_channel_ids: string;
  /** "ok" | "skipped" | "error" */
  status: string;
  last_error: string | null;
  updated_at: number;
}

/**
 * Server-only per-channel describer state. NOT synced. Cooldown + dedup guard:
 * `described_at` gates how often a channel is re-described, and `source_hash`
 * skips rewriting an identical description (which would burn a seq).
 */
export interface AiChannelStateTable {
  channel_id: string;
  /** ms epoch of the last successful describe, or null */
  described_at: number | null;
  /** hash of the channel content the description was derived from, or null */
  source_hash: string | null;
  /** "ok" | "error" | null */
  status: string | null;
  last_error: string | null;
  updated_at: number;
}

/** Single-user password record. Exactly one row is expected, keyed by "owner". */
export interface AuthOwnerTable {
  id: string;
  password_hash: string;
  created_at: number;
  updated_at: number;
}

/**
 * Server-side sessions. The browser only sees the random token; SQLite stores
 * the sha256 hash so a database dump does not contain live bearer tokens.
 */
export interface AuthSessionsTable {
  id: string;
  token_hash: string;
  created_at: number;
  last_seen_at: number;
  user_agent: string | null;
  revoked_at: number | null;
}

export interface Database {
  messages: MessagesTable;
  channels: ChannelsTable;
  embeds: EmbedsTable;
  config: ConfigTable;
  og_cache: OgCacheTable;
  attachments: AttachmentsTable;
  blobs: BlobsTable;
  feed_sources: FeedSourcesTable;
  ai_config: AiConfigTable;
  ai_message_state: AiMessageStateTable;
  ai_channel_state: AiChannelStateTable;
  auth_owner: AuthOwnerTable;
  auth_sessions: AuthSessionsTable;
}
