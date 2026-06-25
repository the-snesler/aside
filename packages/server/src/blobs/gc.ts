import { db } from "../db/index.js";
import { getBlobDriver } from "./index.js";

export interface BlobGcResult {
  /** blobs old enough to be eligible (past the grace period) */
  scanned: number;
  /** blobs actually purged */
  deleted: number;
  bytesReclaimed: number;
}

/** Default grace before an unreferenced blob can be swept. */
export const DEFAULT_GC_GRACE_MS = 24 * 60 * 60 * 1000;

function graceMs(): number {
  const raw = Number(process.env.BLOB_GC_GRACE_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_GC_GRACE_MS;
}

/**
 * Mark-and-sweep garbage collection of orphaned blobs. A blob is kept if a live
 * (non-deleted) attachment references it, or if it's a thumbnail of such a
 * source; everything else older than the grace period is purged from the driver
 * and the `blobs` / `blob_thumbnails` tables.
 *
 * The grace period protects a freshly-uploaded blob whose attachment row hasn't
 * been written yet: an upload lands while the user is still composing, but the
 * attachment doc is only created when the message is sent.
 *
 * Pass `now` to make the cutoff deterministic in tests.
 */
export async function runBlobGc(
  now: number = Date.now(),
): Promise<BlobGcResult> {
  const driver = getBlobDriver();

  // The blobs every live attachment depends on.
  const liveRows = await db
    .selectFrom("attachments")
    .select("blob_hash")
    .where("deleted", "=", 0)
    .distinct()
    .execute();
  const referenced = new Set(liveRows.map((r) => r.blob_hash));

  // A thumbnail is kept iff its source is still referenced. The table is small,
  // so scan it whole rather than building a (potentially huge) SQL IN list.
  const thumbRows = await db
    .selectFrom("blob_thumbnails")
    .select(["source_hash", "thumb_hash"])
    .execute();
  for (const r of thumbRows) {
    if (referenced.has(r.source_hash)) referenced.add(r.thumb_hash);
  }

  const cutoff = now - graceMs();
  const candidates = await db
    .selectFrom("blobs")
    .select(["hash", "size"])
    .where("created_at", "<", cutoff)
    .execute();

  let deleted = 0;
  let bytesReclaimed = 0;
  for (const blob of candidates) {
    if (referenced.has(blob.hash)) continue;
    await driver.delete(blob.hash);
    await db.deleteFrom("blobs").where("hash", "=", blob.hash).execute();
    await db
      .deleteFrom("blob_thumbnails")
      .where((eb) =>
        eb.or([
          eb("thumb_hash", "=", blob.hash),
          eb("source_hash", "=", blob.hash),
        ]),
      )
      .execute();
    deleted += 1;
    bytesReclaimed += blob.size;
  }

  return { scanned: candidates.length, deleted, bytesReclaimed };
}
