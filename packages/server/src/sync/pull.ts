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
 * server-assigned seq so client clock skew cannot affect sync ordering.
 */
export async function pull(req: PullRequest): Promise<PullResponse> {
  const cp = req.checkpoint;
  const limit = req.batchSize > 0 ? req.batchSize : 100;

  let query = db
    .selectFrom("messages")
    .selectAll()
    .orderBy("seq", "asc")
    .limit(limit);

  if (cp) {
    query = query.where("seq", ">", cp.seq);
  }

  const rows = await query.execute();
  const documents = rows.map(rowToDoc);
  const last = rows[rows.length - 1];
  const checkpoint: Checkpoint | null = last ? { seq: last.seq } : cp;

  return { documents, checkpoint };
}
