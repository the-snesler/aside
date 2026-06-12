import type {
  ReplicatedAttachmentDoc,
  ReplicatedChannelDoc,
  ReplicatedConfigDoc,
  ReplicatedEmbedDoc,
  ReplicatedMessageDoc,
} from "@aside/shared";
import type {
  AttachmentsTable,
  ChannelsTable,
  ConfigTable,
  EmbedsTable,
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

/**
 * SQLite row → replication wire document, for embeds. Null OpenGraph columns are
 * *omitted* rather than emitted as `null`: the RxDB schema types these fields as
 * `string` (outside `required`), so the client's dev-mode validator rejects an
 * explicit `null`.
 */
export function embedRowToDoc(row: EmbedsTable): ReplicatedEmbedDoc {
  const doc: ReplicatedEmbedDoc = {
    id: row.id,
    messageId: row.message_id,
    url: row.url,
    sourceUpdatedAt: row.source_updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _deleted: row.deleted === 1,
  };
  if (row.title !== null) doc.title = row.title;
  if (row.description !== null) doc.description = row.description;
  if (row.image !== null) doc.image = row.image;
  if (row.site_name !== null) doc.siteName = row.site_name;
  return doc;
}

/** Replication wire document → SQLite row, for embeds. Absent fields become null. */
export function embedDocToRow(
  doc: ReplicatedEmbedDoc,
  seq: number,
): EmbedsTable {
  return {
    id: doc.id,
    message_id: doc.messageId,
    url: doc.url,
    title: doc.title ?? null,
    description: doc.description ?? null,
    image: doc.image ?? null,
    site_name: doc.siteName ?? null,
    source_updated_at: doc.sourceUpdatedAt,
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

/** SQLite row → replication wire document, for config. `value` passes through. */
export function configRowToDoc(row: ConfigTable): ReplicatedConfigDoc {
  return {
    id: row.id,
    value: row.value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _deleted: row.deleted === 1,
  };
}

/** Replication wire document → SQLite row, for config. */
export function configDocToRow(
  doc: ReplicatedConfigDoc,
  seq: number,
): ConfigTable {
  return {
    id: doc.id,
    value: doc.value,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    seq,
    deleted: doc._deleted ? 1 : 0,
  };
}
