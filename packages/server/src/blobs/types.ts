/**
 * A content-addressed blob store. Blobs are keyed by the sha256 hex digest of
 * their bytes, so identical content dedupes to one object and a stored object's
 * bytes never change. This is the storage seam: the filesystem driver is the
 * default; an S3/MinIO driver (BLOB-2) can drop in behind the same interface.
 */
export interface BlobDriver {
  /** Driver kind, for logging/diagnostics, e.g. "filesystem". */
  readonly name: string;
  /** Whether a blob with this hash is already stored. */
  exists(hash: string): Promise<boolean>;
  /**
   * Store `data` under `hash`. Idempotent: because the hash addresses the
   * content, re-putting identical bytes is a no-op.
   */
  put(hash: string, data: Buffer): Promise<void>;
  /** The bytes for `hash`, or null if absent. */
  get(hash: string): Promise<Buffer | null>;
  /** Remove the blob if present; absent is not an error. */
  delete(hash: string): Promise<void>;
}
