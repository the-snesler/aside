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
