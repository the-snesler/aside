import type { ReplicatedMessageDoc } from "@aside/shared";
import type { MessagesTable } from "../db/types.js";

/** SQLite row → replication wire document. */
export function rowToDoc(row: MessagesTable): ReplicatedMessageDoc {
  return {
    id: row.id,
    channelId: row.channel_id,
    text: row.text,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _deleted: row.deleted === 1,
  };
}

/** Replication wire document → SQLite row. */
export function docToRow(doc: ReplicatedMessageDoc, seq: number): MessagesTable {
  return {
    id: doc.id,
    channel_id: doc.channelId,
    text: doc.text,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    seq,
    deleted: doc._deleted ? 1 : 0,
  };
}
