import { channelDocSchema, type ReplicatedChannelDoc } from "@aside/shared";
import { db } from "../db/index.js";
import type { SyncCollection } from "./collection.js";
import { channelDocToRow, channelRowToDoc } from "./row.js";

/** The channels collection wired into the generic pull/push orchestration. */
export const channelsSync: SyncCollection<ReplicatedChannelDoc> = {
  name: "channels",

  parse(input) {
    return channelDocSchema.parse(input);
  },

  async fetchSince(sinceSeq, limit) {
    const rows = await db
      .selectFrom("channels")
      .selectAll()
      .where("seq", ">", sinceSeq)
      .orderBy("seq", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => ({ doc: channelRowToDoc(row), seq: row.seq }));
  },

  async fetchById(id) {
    const existing = await db
      .selectFrom("channels")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return existing ? channelRowToDoc(existing) : null;
  },

  async upsert(doc, seq) {
    const row = channelDocToRow(doc, seq);
    await db
      .insertInto("channels")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          name: row.name,
          description: row.description,
          created_at: row.created_at,
          updated_at: row.updated_at,
          seq: row.seq,
          deleted: row.deleted,
        }),
      )
      .execute();
  },
};
