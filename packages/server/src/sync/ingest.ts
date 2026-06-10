import { nextRev } from "../db/sequence.js";
import type { ReplicatedDoc, SyncCollection } from "./collection.js";
import { emitChange } from "./stream.js";

/**
 * Writes server-originated documents through the same seq/upsert/stream path as
 * {@link push}, for inserts that don't come from a client (e.g. a feed pulling in
 * external data). Ids that already exist — *including soft-deleted rows* — are
 * skipped, so:
 *   - re-runs are idempotent (the same item is never inserted twice), and
 *   - a doc the user has since edited or deleted is never clobbered or
 *     resurrected.
 *
 * Returns the docs that were actually written. A single batched `emitChange`
 * fans the new docs out to connected clients over the existing SSE stream,
 * mirroring push.ts.
 */
export async function ingestNewBatch<TDoc extends ReplicatedDoc>(
  coll: SyncCollection<TDoc>,
  docs: TDoc[],
): Promise<TDoc[]> {
  const written: Array<{ doc: TDoc; seq: number }> = [];

  for (const doc of docs) {
    const existing = await coll.fetchById(doc.id);
    if (existing) continue;
    const seq = nextRev(coll.name);
    await coll.upsert(doc, seq);
    written.push({ doc, seq });
  }

  if (written.length > 0) {
    const latestSeq = Math.max(...written.map((entry) => entry.seq));
    emitChange(coll.name, {
      documents: written.map((entry) => entry.doc),
      checkpoint: { seq: latestSeq },
    });
  }

  return written.map((entry) => entry.doc);
}
