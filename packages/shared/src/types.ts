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
 * Replication checkpoint. The server owns `seq` and uses it as the pull cursor,
 * so sync ordering does not depend on client clocks.
 */
export interface Checkpoint {
  seq: number;
}

/** Default channel every message lands in for the POC. */
export const DEFAULT_CHANNEL_ID = "general";
