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
    channelIds: parseChannelIds(row.channel_ids, row.channel_id),
    text: row.text,
    createdAt: row.created_at,
    dueAt: row.due_at ?? 0,
    updatedAt: row.updated_at,
    _deleted: row.deleted === 1,
  };
}

/** Replication wire document → SQLite row. */
export function docToRow(
  doc: ReplicatedMessageDoc,
  seq: number,
): MessagesTable {
  const channelIds = normalizeChannelIds(doc.channelIds);
  return {
    id: doc.id,
    channel_id: channelIds[0]!,
    channel_ids: JSON.stringify(channelIds),
    text: doc.text,
    created_at: doc.createdAt,
    due_at: doc.dueAt,
    updated_at: doc.updatedAt,
    seq,
    deleted: doc._deleted ? 1 : 0,
  };
}

function parseChannelIds(value: string | null, fallback: string): string[] {
  if (!value) return [fallback];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return normalizeChannelIds(parsed, fallback);
  } catch {
    // Fall through to the legacy single-channel column.
  }
  return [fallback];
}

function normalizeChannelIds(input: unknown[], fallback = "general"): string[] {
  const ids = input.filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  const unique = [...new Set(ids)];
  return unique.length > 0 ? unique : [fallback];
}

/**
 * SQLite row → replication wire document, for channels. A null `description` is
 * *omitted* rather than emitted as `null`: the RxDB schema types it as `string`
 * (outside `required`), so the client's dev-mode validator rejects explicit null.
 */
export function channelRowToDoc(row: ChannelsTable): ReplicatedChannelDoc {
  const doc: ReplicatedChannelDoc = {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    _deleted: row.deleted === 1,
  };
  if (row.description !== null) doc.description = row.description;
  if (row.color !== null) doc.color = row.color;
  if (row.type === "standard" || row.type === "todo") doc.type = row.type;
  const pinnedMessageIds = parsePinnedMessageIds(row.pinned_message_ids);
  if (pinnedMessageIds.length > 0) doc.pinnedMessageIds = pinnedMessageIds;
  if (row.sort_order !== null) doc.sortOrder = row.sort_order;
  return doc;
}

/** Replication wire document → SQLite row, for channels. Absent description → null. */
export function channelDocToRow(
  doc: ReplicatedChannelDoc,
  seq: number,
): ChannelsTable {
  return {
    id: doc.id,
    name: doc.name,
    description: doc.description ?? null,
    color: doc.color ?? null,
    type: doc.type ?? null,
    pinned_message_ids: doc.pinnedMessageIds
      ? JSON.stringify(doc.pinnedMessageIds)
      : null,
    sort_order: doc.sortOrder ?? null,
    created_at: doc.createdAt,
    updated_at: doc.updatedAt,
    seq,
    deleted: doc._deleted ? 1 : 0,
  };
}

function parsePinnedMessageIds(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [
      ...new Set(
        parsed.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        ),
      ),
    ];
  } catch {
    return [];
  }
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
