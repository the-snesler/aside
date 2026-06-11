import { join } from "node:path";

/**
 * Root of the content-addressed blob store on the data volume. Mirrors the
 * DATA_DIR default used by the SQLite path in db/index.ts and the feeds
 * profiles, so blobs live on the same mounted `/data` volume in the container
 * and survive restarts.
 */
export function blobsRoot(): string {
  const dataDir = process.env.DATA_DIR ?? "./data";
  return join(dataDir, "blobs");
}

/**
 * On-disk path for a blob, sharded by the first two hex chars of its sha256 so
 * no single directory holds every blob: `blobs/ab/abcd…`. The hash is the
 * content address, so the path is stable and immutable.
 */
export function blobPath(hash: string): string {
  return join(blobsRoot(), hash.slice(0, 2), hash);
}
