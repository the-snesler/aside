import type { ReplicatedMessageDoc } from "@aside/shared";
import { messageDocSchema } from "@aside/shared";
import { db } from "../db/index.js";
import { nextRev } from "../db/sequence.js";
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
  const written: Array<{ doc: ReplicatedMessageDoc; seq: number }> = [];

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

    const seq = nextRev();
    const dbRow = docToRow(doc, seq);
    await db
      .insertInto("messages")
      .values(dbRow)
      .onConflict((oc) =>
        oc.column("id").doUpdateSet({
          channel_id: dbRow.channel_id,
          text: dbRow.text,
          created_at: dbRow.created_at,
          updated_at: dbRow.updated_at,
          seq: dbRow.seq,
          deleted: dbRow.deleted,
        }),
      )
      .execute();
    written.push({ doc, seq });
  }

  if (written.length > 0) {
    const latestSeq = Math.max(...written.map((entry) => entry.seq));
    emitChange({
      documents: written.map((entry) => entry.doc),
      checkpoint: { seq: latestSeq },
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
