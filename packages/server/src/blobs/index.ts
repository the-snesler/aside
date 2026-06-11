import { createHash } from "node:crypto";
import { filesystemBlobDriver } from "./filesystem.js";
import type { BlobDriver } from "./types.js";

export type { BlobDriver } from "./types.js";

/**
 * The active blob driver. Filesystem is the only implementation today; this is
 * the single place an S3/MinIO driver (BLOB-2) swaps in behind {@link BlobDriver},
 * keyed on an env var (e.g. `BLOB_DRIVER` / `BLOB_S3_*`).
 */
export function getBlobDriver(): BlobDriver {
  return filesystemBlobDriver;
}

/** sha256 hex digest of `data` — the content address used as the blob key. */
export function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
