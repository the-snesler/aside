import type {
  ReplicatedAttachmentDoc,
  ReplicatedChannelDoc,
  ReplicatedMessageDoc,
} from "@aside/shared";
import type {
  AttachmentsTable,
  ChannelsTable,
  MessagesTable,
} from "../db/types.js";

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
export function docToRow(
  doc: ReplicatedMessageDoc,
  seq: number,
): MessagesTable {
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

/** SQLite row → replication wire document, for channels. */
export function channelRowToDoc(row: ChannelsTable): ReplicatedChannelDoc {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _deleted: row.deleted === 1,
  };
}

/** Replication wire document → SQLite row, for channels. */
export function channelDocToRow(
  doc: ReplicatedChannelDoc,
  seq: number,
): ChannelsTable {
  return {
    id: doc.id,
    name: doc.name,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    seq,
    deleted: doc._deleted ? 1 : 0,
  };
}

/** SQLite row → replication wire document, for attachments. */
export function attachmentRowToDoc(
  row: AttachmentsTable,
): ReplicatedAttachmentDoc {
  return {
    id: row.id,
    messageId: row.message_id,
    blobHash: row.blob_hash,
    fileName: row.file_name,
    mimeType: row.mime_type,
    size: row.size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _deleted: row.deleted === 1,
  };
}

/** Replication wire document → SQLite row, for attachments. */
export function attachmentDocToRow(
  doc: ReplicatedAttachmentDoc,
  seq: number,
): AttachmentsTable {
  return {
    id: doc.id,
    message_id: doc.messageId,
    blob_hash: doc.blobHash,
    file_name: doc.fileName,
    mime_type: doc.mimeType,
    size: doc.size,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    seq,
    deleted: doc._deleted ? 1 : 0,
  };
}
