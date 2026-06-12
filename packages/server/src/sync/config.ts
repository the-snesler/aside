import { configDocSchema, type ReplicatedConfigDoc } from "@aside/shared";
import { db } from "../db/index.js";
import type { SyncCollection } from "./collection.js";
import { configDocToRow, configRowToDoc } from "./row.js";

/** The config collection wired into the generic pull/push orchestration. */
export const configSync: SyncCollection<ReplicatedConfigDoc> = {
  name: "config",

  parse(input) {
    return configDocSchema.parse(input);
  },

  async fetchSince(sinceSeq, limit) {
    const rows = await db
      .selectFrom("config")
      .selectAll()
      .where("seq", ">", sinceSeq)
      .orderBy("seq", "asc")
      .limit(limit)
      .execute();
    return rows.map((row) => ({ doc: configRowToDoc(row), seq: row.seq }));
  },

  async fetchById(id) {
    const existing = await db
      .selectFrom("config")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
    return existing ? configRowToDoc(existing) : null;
  },

  async upsert(doc, seq) {
    const row = configDocToRow(doc, seq);
    await db
      .insertInto("config")
      .values(row)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          value: row.value,
          created_at: row.created_at,
          updated_at: row.updated_at,
          seq: row.seq,
          deleted: row.deleted,
        }),
      )
      .execute();
  },
};
