import type { ReplicatedMessageDoc } from "@aside/shared";
import { messageDocSchema } from "@aside/shared";
import { db } from "../db/index.js";
import { docToRow, rowToDoc } from "./row.js";
import { emitChange } from "./stream.js";

export interface PushRow {
  newDocumentState: ReplicatedMessageDoc;
  assumedMasterState?: ReplicatedMessageDoc | null;
}

/**
 * Applies a batch of client changes. For each row we compare the real current
 * master state against what the client assumed; on mismatch we return the real
 * state as a conflict (RxDB resolves and re-pushes). Otherwise we upsert.
 * The array of conflicting master documents is the response RxDB expects.
 */
export async function push(rows: PushRow[]): Promise<ReplicatedMessageDoc[]> {
  const conflicts: ReplicatedMessageDoc[] = [];
  const written: ReplicatedMessageDoc[] = [];

  for (const row of rows) {
    const doc = messageDocSchema.parse(row.newDocumentState);

    const existing = await db
      .selectFrom("messages")
      .selectAll()
      .where("id", "=", doc.id)
      .executeTakeFirst();
    const realMaster = existing ? rowToDoc(existing) : null;

    if (!sameMaster(realMaster, row.assumedMasterState ?? null)) {
      if (realMaster) conflicts.push(realMaster);
      continue;
    }

    const dbRow = docToRow(doc);
    await db
      .insertInto("messages")
      .values(dbRow)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          channel_id: dbRow.channel_id,
          text: dbRow.text,
          created_at: dbRow.created_at,
          updated_at: dbRow.updated_at,
          deleted: dbRow.deleted,
        }),
      )
      .execute();
    written.push(doc);
  }

  if (written.length > 0) {
    const latest = written.reduce((a, b) => (b.updatedAt > a.updatedAt ? b : a));
    emitChange({
      documents: written,
      checkpoint: { id: latest.id, updatedAt: latest.updatedAt },
    });
  }

  return conflicts;
}

function sameMaster(
  a: ReplicatedMessageDoc | null,
  b: ReplicatedMessageDoc | null,
): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return (
    a.id === b.id &&
    a.channelId === b.channelId &&
    a.text === b.text &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    a._deleted === b._deleted
  );
}
