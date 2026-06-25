import sharp from "sharp";
import { db } from "../db/index.js";
import { getBlobDriver, sha256 } from "./index.js";

/**
 * Lazy, content-addressed image thumbnails. The first request for a given
 * `(source, width)` resizes the original to a WebP and stores it as its own
 * blob; later requests serve the cached bytes. Because each thumbnail is a
 * normal blob recorded in the `blobs` table, it downloads and garbage-collects
 * through the same machinery as any attachment — GC keeps a thumbnail alive only
 * while its source is still referenced (see blobs/gc.ts).
 */

export interface Thumbnail {
  /** sha256 of the thumbnail blob */
  hash: string;
  contentType: string;
  bytes: Buffer;
}

/** Widths we generate. Bounding the set keeps the cache small and stops a
 *  caller from forcing arbitrary, expensive resizes. */
export const THUMBNAIL_WIDTHS = [200, 400, 800] as const;
export const DEFAULT_THUMBNAIL_WIDTH = 400;

const THUMBNAIL_CONTENT_TYPE = "image/webp";

// Image types we deliberately don't rasterize into a static thumbnail: an
// animated GIF would lose its animation and an SVG is already a tiny vector.
// The route serves the original for these.
const PASS_THROUGH = new Set(["image/gif", "image/svg+xml"]);

/** Snap an arbitrary requested width to the nearest supported size. */
export function clampThumbnailWidth(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) {
    return DEFAULT_THUMBNAIL_WIDTH;
  }
  let best: number = THUMBNAIL_WIDTHS[0];
  for (const w of THUMBNAIL_WIDTHS) {
    if (Math.abs(w - requested) < Math.abs(best - requested)) best = w;
  }
  return best;
}

/**
 * Return the cached thumbnail for `sourceHash` at `width`, generating and
 * caching it on first call. Returns null when there's nothing to thumbnail —
 * the source is missing, isn't an image, is a pass-through type, or can't be
 * decoded — and the caller should fall back to the original blob.
 */
export async function getOrCreateThumbnail(
  sourceHash: string,
  width: number,
): Promise<Thumbnail | null> {
  const driver = getBlobDriver();

  const cached = await db
    .selectFrom("blob_thumbnails")
    .select(["thumb_hash"])
    .where("source_hash", "=", sourceHash)
    .where("width", "=", width)
    .executeTakeFirst();
  if (cached) {
    const bytes = await driver.get(cached.thumb_hash);
    if (bytes) {
      return {
        hash: cached.thumb_hash,
        contentType: THUMBNAIL_CONTENT_TYPE,
        bytes,
      };
    }
    // The cache row points at a blob that's gone (e.g. GC raced it). Fall
    // through and regenerate; the upserts below are idempotent.
  }

  const meta = await db
    .selectFrom("blobs")
    .select(["content_type"])
    .where("hash", "=", sourceHash)
    .executeTakeFirst();
  if (!meta) return null;
  if (!meta.content_type.startsWith("image/")) return null;
  if (PASS_THROUGH.has(meta.content_type)) return null;

  const original = await driver.get(sourceHash);
  if (!original) return null;

  let out: { data: Buffer; info: sharp.OutputInfo };
  try {
    out = await sharp(original)
      .rotate() // apply EXIF orientation before metadata is stripped
      .resize({ width, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    // Corrupt or unsupported image — let the caller serve the original.
    return null;
  }

  const thumbHash = sha256(out.data);
  await driver.put(thumbHash, out.data);

  const now = Date.now();
  // The thumbnail is a first-class blob so it serves and GCs like any other.
  await db
    .insertInto("blobs")
    .values({
      hash: thumbHash,
      content_type: THUMBNAIL_CONTENT_TYPE,
      size: out.data.byteLength,
      created_at: now,
    })
    .onConflict((oc) => oc.column("hash").doNothing())
    .execute();
  await db
    .insertInto("blob_thumbnails")
    .values({
      source_hash: sourceHash,
      width,
      thumb_hash: thumbHash,
      thumb_width: out.info.width,
      thumb_height: out.info.height,
      created_at: now,
    })
    .onConflict((oc) => oc.columns(["source_hash", "width"]).doNothing())
    .execute();

  return {
    hash: thumbHash,
    contentType: THUMBNAIL_CONTENT_TYPE,
    bytes: out.data,
  };
}
