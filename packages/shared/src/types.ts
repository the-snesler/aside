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
  /** ms epoch — last-write-time; drives the replication pull checkpoint */
  updatedAt: number;
}

/** A document as it travels over the sync protocol, carrying RxDB's soft-delete flag. */
export type ReplicatedMessageDoc = MessageDoc & { _deleted: boolean };

/**
 * Replication checkpoint. The server orders the pull by (updatedAt, id), so the
 * checkpoint carries both to disambiguate documents sharing an updatedAt.
 */
export interface Checkpoint {
  id: string;
  updatedAt: number;
}

/** Default channel every message lands in for the POC. */
export const DEFAULT_CHANNEL_ID = "general";
