// Must be first: points the db singleton at in-memory SQLite + a tmp blob dir.
import "../test/env.js";

import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { db, initDb } from "../db/index.js";
import { getBlobDriver, sha256 } from "./index.js";
import { getOrCreateThumbnail } from "./thumbnails.js";

async function storeBlob(bytes: Buffer, contentType: string): Promise<string> {
  const hash = sha256(bytes);
  await getBlobDriver().put(hash, bytes);
  await db
    .insertInto("blobs")
    .values({
      hash,
      content_type: contentType,
      size: bytes.byteLength,
      created_at: Date.now(),
    })
    .onConflict((oc) => oc.column("hash").doNothing())
    .execute();
  return hash;
}

beforeAll(async () => {
  await initDb();
});

describe("thumbnails", () => {
  it("generates and caches a webp thumbnail", async () => {
    const png = await sharp({
      create: {
        width: 1200,
        height: 800,
        channels: 3,
        background: { r: 200, g: 80, b: 140 },
      },
    })
      .png()
      .toBuffer();
    const hash = await storeBlob(png, "image/png");

    const thumb = await getOrCreateThumbnail(hash, 400);
    expect(thumb).not.toBeNull();
    expect(thumb!.contentType).toBe("image/webp");
    expect(thumb!.bytes.byteLength).toBeGreaterThan(0);
    expect(thumb!.bytes.byteLength).toBeLessThan(png.byteLength);

    // The thumbnail is recorded as its own blob and in the cache table.
    const meta = await db
      .selectFrom("blobs")
      .selectAll()
      .where("hash", "=", thumb!.hash)
      .executeTakeFirst();
    expect(meta?.content_type).toBe("image/webp");

    const rows = await db
      .selectFrom("blob_thumbnails")
      .selectAll()
      .where("source_hash", "=", hash)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.width).toBe(400);
    expect(rows[0]!.thumb_width).toBeLessThanOrEqual(400);

    // A second request hits the cache: same thumb hash, no new row.
    const again = await getOrCreateThumbnail(hash, 400);
    expect(again!.hash).toBe(thumb!.hash);
    const rows2 = await db
      .selectFrom("blob_thumbnails")
      .selectAll()
      .where("source_hash", "=", hash)
      .execute();
    expect(rows2).toHaveLength(1);
  });

  it("returns null for a non-image blob", async () => {
    const hash = await storeBlob(Buffer.from("just text"), "text/plain");
    expect(await getOrCreateThumbnail(hash, 400)).toBeNull();
  });

  it("returns null for a missing blob", async () => {
    expect(await getOrCreateThumbnail("nope", 400)).toBeNull();
  });
});
