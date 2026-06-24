import { messageDocSchema, type ReplicatedMessageDoc } from "@aside/shared";
import { db } from "../db/index.js";
import type { SyncCollection } from "./collection.js";
import { docToRow, rowToDoc } from "./row.js";

/** The messages collection wired into the generic pull/push orchestration. */
export const messagesSync: SyncCollection<ReplicatedMessageDoc> = {
  name: "messages",

  parse(input) {
    return messageDocSchema.parse(input);
  },

  async fetchSince(sinceSeq, limit) {
    const rows = await db
      .selectFrom("messages")
      .selectAll()
      .where("seq", ">", sinceSeq)
      .orderBy("seq", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => ({ doc: rowToDoc(row), seq: row.seq }));
  },

  async fetchById(id) {
    const existing = await db
      .selectFrom("messages")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return existing ? rowToDoc(existing) : null;
  },

  async upsert(doc, seq) {
    const row = docToRow(doc, seq);
    await db
      .insertInto("messages")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          channel_id: row.channel_id,
          channel_ids: row.channel_ids,
          text: row.text,
          created_at: row.created_at,
          due_at: row.due_at,
          updated_at: row.updated_at,
          seq: row.seq,
          deleted: row.deleted,
        }),
      )
      .execute();
  },
};
