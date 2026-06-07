import type { Checkpoint, ReplicatedMessageDoc } from "@aside/shared";
import { db } from "../db/index.js";
import { rowToDoc } from "./row.js";

export interface PullRequest {
  checkpoint: Checkpoint | null;
  batchSize: number;
}

export interface PullResponse {
  documents: ReplicatedMessageDoc[];
  checkpoint: Checkpoint | null;
}

/**
 * Returns documents changed since the client's checkpoint, ordered by
 * (updated_at, id) so the checkpoint is a stable cursor even when several
 * documents share an updated_at.
 */
export async function pull(req: PullRequest): Promise<PullResponse> {
  const cp = req.checkpoint;
  const limit = req.batchSize > 0 ? req.batchSize : 100;

  let query = db
    .selectFrom("messages")
    .selectAll()
    .orderBy("updated_at", "asc")
    .orderBy("id", "asc")
    .limit(limit);

  if (cp) {
    query = query.where((eb) =>
      eb.or([
        eb("updated_at", ">", cp.updatedAt),
        eb.and([eb("updated_at", "=", cp.updatedAt), eb("id", ">", cp.id)]),
      ]),
    );
  }

  const rows = await query.execute();
  const documents = rows.map(rowToDoc);
  const last = rows[rows.length - 1];
  const checkpoint: Checkpoint | null = last
    ? { id: last.id, updatedAt: last.updated_at }
    : cp;

  return { documents, checkpoint };
}
