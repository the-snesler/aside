import { embedDocSchema, type ReplicatedEmbedDoc } from "@aside/shared";
import { db } from "../db/index.js";
import type { SyncCollection } from "./collection.js";
import { embedDocToRow, embedRowToDoc } from "./row.js";

/**
 * The embeds collection wired into the generic pull/push orchestration. Embeds
 * are server-authoritative — the extraction worker is the only writer (via
 * {@link writeServerBatch}); clients pull them read-only — but they ride the same
 * sync protocol as messages and channels.
 */
export const embedsSync: SyncCollection<ReplicatedEmbedDoc> = {
  name: "embeds",

  parse(input) {
    return embedDocSchema.parse(input);
  },

  async fetchSince(sinceSeq, limit) {
    const rows = await db
      .selectFrom("embeds")
      .selectAll()
      .where("seq", ">", sinceSeq)
      .orderBy("seq", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => ({ doc: embedRowToDoc(row), seq: row.seq }));
  },

  async fetchById(id) {
    const existing = await db
      .selectFrom("embeds")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return existing ? embedRowToDoc(existing) : null;
  },

  async upsert(doc, seq) {
    const row = embedDocToRow(doc, seq);
    await db
      .insertInto("embeds")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          message_id: row.message_id,
          url: row.url,
          title: row.title,
          description: row.description,
          image: row.image,
          site_name: row.site_name,
          source_updated_at: row.source_updated_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
          seq: row.seq,
          deleted: row.deleted,
        }),
      )
      .execute();
  },
};

/**
 * All embeds the worker currently has for a message, including soft-deleted ones
 * (so it can tell "already deleted" from "needs creating"). Keyed off the
 * `embeds_message_id` index.
 */
export async function fetchEmbedsByMessageId(
  messageId: string,
): Promise<ReplicatedEmbedDoc[]> {
  const rows = await db
    .selectFrom("embeds")
    .selectAll()
    .where("message_id", "=", messageId)
    .execute();
  return rows.map(embedRowToDoc);
}
