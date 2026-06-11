import { nextRev } from "../db/sequence.js";
import type { ReplicatedDoc, SyncCollection } from "./collection.js";
import { emitChange } from "./stream.js";

/**
 * Writes server-authoritative documents through the seq/upsert/stream path,
 * *unconditionally* — every doc gets a fresh seq and overwrites whatever is
 * there. This is the counterpart to {@link ingestNewBatch}: ingest skips ids
 * that already exist (so it never clobbers user data), whereas this is for
 * collections the server fully owns (embeds), where overwriting and
 * soft-deleting are exactly the point.
 *
 * Upserts and soft-deletes are emitted in a single batched `emitChange` with the
 * max seq as the checkpoint, mirroring push.ts/ingest.ts — so a client can't
 * checkpoint past half a batch if its SSE connection drops mid-stream.
 */
export async function writeServerBatch<TDoc extends ReplicatedDoc>(
  coll: SyncCollection<TDoc>,
  docs: TDoc[],
): Promise<void> {
  if (docs.length === 0) return;

  const written: Array<{ doc: TDoc; seq: number }> = [];
  for (const doc of docs) {
    const seq = nextRev(coll.name);
    await coll.upsert(doc, seq);
    written.push({ doc, seq });
  }

  const latestSeq = Math.max(...written.map((entry) => entry.seq));
  emitChange(coll.name, {
    documents: written.map((entry) => entry.doc),
    checkpoint: { seq: latestSeq },
  });
}
