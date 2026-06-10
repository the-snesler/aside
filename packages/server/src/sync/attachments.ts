import {
  attachmentDocSchema,
  type ReplicatedAttachmentDoc,
} from "@aside/shared";
import { db } from "../db/index.js";
import type { SyncCollection } from "./collection.js";
import { attachmentDocToRow, attachmentRowToDoc } from "./row.js";

/** The attachments collection wired into the generic pull/push orchestration. */
export const attachmentsSync: SyncCollection<ReplicatedAttachmentDoc> = {
  name: "attachments",

  parse(input) {
    return attachmentDocSchema.parse(input);
  },

  async fetchSince(sinceSeq, limit) {
    const rows = await db
      .selectFrom("attachments")
      .selectAll()
      .where("seq", ">", sinceSeq)
      .orderBy("seq", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => ({ doc: attachmentRowToDoc(row), seq: row.seq }));
  },

  async fetchById(id) {
    const existing = await db
      .selectFrom("attachments")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return existing ? attachmentRowToDoc(existing) : null;
  },

  async upsert(doc, seq) {
    const row = attachmentDocToRow(doc, seq);
    await db
      .insertInto("attachments")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          message_id: row.message_id,
          blob_hash: row.blob_hash,
          file_name: row.file_name,
          mime_type: row.mime_type,
          size: row.size,
          created_at: row.created_at,
          updated_at: row.updated_at,
          seq: row.seq,
          deleted: row.deleted,
        }),
      )
      .execute();
  },
};
