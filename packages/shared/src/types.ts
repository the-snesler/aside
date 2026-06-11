/**
 * The single source of truth for a message's shape. Both the client (RxDB
 * collection) and the server (sync handlers) import this. If these drift, sync
 * corrupts silently — so the schema and validator are derived from the same
 * intent and kept in lockstep.
 *
 * Note the split: RxDB owns the `_deleted` soft-delete flag, so the *document*
 * type and JSON schema must NOT include it. It only appears on the wire during
 * replication, captured by {@link ReplicatedMessageDoc}.
 */
export interface MessageDoc {
  /** uuid */
  id: string;
  /** groundwork for channels; defaults to "general" until there's a channel UI */
  channelId: string;
  text: string;
  /** ms epoch */
  createdAt: number;
  /** ms epoch — last-write-time; used by conflict resolution and UI sorting */
  updatedAt: number;
}

/** A document as it travels over the sync protocol, carrying RxDB's soft-delete flag. */
export type ReplicatedMessageDoc = MessageDoc & { _deleted: boolean };

/**
 * A channel groups messages. Like {@link MessageDoc}, the document type omits
 * `_deleted` (RxDB owns it); it only appears on the wire via
 * {@link ReplicatedChannelDoc}. `name` doubles as the `#tag` handle, so it is
 * kept slug-like (lowercase, hyphenated) by the client.
 */
export interface ChannelDoc {
  /** uuid — except the default channel, whose id is {@link DEFAULT_CHANNEL_ID}. */
  id: string;
  /** display + `#tag` handle, e.g. "general" */
  name: string;
  /** ms epoch */
  createdAt: number;
  /** ms epoch — last-write-time; used by conflict resolution and UI sorting */
  updatedAt: number;
}

/** A channel as it travels over the sync protocol, carrying RxDB's soft-delete flag. */
export type ReplicatedChannelDoc = ChannelDoc & { _deleted: boolean };

/**
 * An OpenGraph link-preview "sidecar" for a URL found in a message (OG-1/OG-2).
 *
 * Unlike messages and channels, embeds are *server-authoritative*: the server
 * fetches and writes them, clients only ever read them. Keeping them in their
 * own collection means the server never has to touch the client-owned message
 * doc — so attaching a preview never marks a note as edited and never contends
 * with a client edit through LWW. A message can have several embeds (one per
 * URL), so `id` is derived from `messageId` + the URL, not equal to `messageId`.
 *
 * `sourceUpdatedAt` records the message `updatedAt` this embed was derived from;
 * the extraction worker uses it as a staleness guard so a slow fetch never
 * attaches a preview built from text that has since been edited away.
 */
export interface EmbedDoc {
  /** `${messageId}:${shortHash(url)}` — deterministic so re-runs upsert in place */
  id: string;
  /** the message this preview belongs to */
  messageId: string;
  /** the URL the preview was built from */
  url: string;
  title?: string;
  description?: string;
  /** absolute image URL (og:image), resolved against the page URL */
  image?: string;
  /** og:site_name, e.g. "GitHub" */
  siteName?: string;
  /** the message `updatedAt` this preview was derived from; staleness guard */
  sourceUpdatedAt: number;
  /** ms epoch */
  createdAt: number;
  /** ms epoch — last-write-time; used by conflict resolution */
  updatedAt: number;
}

/** An embed as it travels over the sync protocol, carrying RxDB's soft-delete flag. */
export type ReplicatedEmbedDoc = EmbedDoc & { _deleted: boolean };

/**
 * An attachment links a message to a blob (file bytes) held by the server's blob
 * store, addressed by its sha256 hash. Only the *metadata* syncs through RxDB;
 * the bytes are fetched on demand from `/api/blobs/:hash`. Like {@link MessageDoc},
 * `_deleted` is RxDB-owned and omitted here — it rides the wire via
 * {@link ReplicatedAttachmentDoc}.
 */
export interface AttachmentDoc {
  /** uuid */
  id: string;
  /** the message this attachment hangs off of */
  messageId: string;
  /** sha256 hex of the bytes — the content-addressed key into the blob store */
  blobHash: string;
  /** original filename, for display + download */
  fileName: string;
  /** MIME type, e.g. "image/png" */
  mimeType: string;
  /** byte length */
  size: number;
  /** ms epoch */
  createdAt: number;
  /** ms epoch — last-write-time; used by conflict resolution and UI sorting */
  updatedAt: number;
}

/** An attachment as it travels over the sync protocol, carrying RxDB's soft-delete flag. */
export type ReplicatedAttachmentDoc = AttachmentDoc & { _deleted: boolean };

/**
 * Replication checkpoint. The server owns `seq` and uses it as the pull cursor,
 * so sync ordering does not depend on client clocks. Each collection tracks its
 * own checkpoint.
 */
export interface Checkpoint {
  seq: number;
}

/**
 * The default channel every message lands in. Used as the channel's *id* (not a
 * uuid) so messages written before there was a channel UI — which carry
 * `channelId: "general"` — keep a valid home.
 */
export const DEFAULT_CHANNEL_ID = "general";
