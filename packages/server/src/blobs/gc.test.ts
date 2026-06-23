// Must be first: points the db singleton at in-memory SQLite + a tmp blob dir.
import "../test/env.js";

import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, initDb } from "../db/index.js";
import { runBlobGc } from "./gc.js";
import { getBlobDriver, sha256 } from "./index.js";

const NOW = 10_000_000_000_000;
const DAY = 24 * 60 * 60 * 1000;
const OLD = NOW - 2 * DAY; // safely past the 24h grace
const FRESH = NOW; // within grace

async function putBlob(
  content: string,
  createdAt: number,
  contentType = "image/png",
): Promise<string> {
  const buf = Buffer.from(content);
  const hash = sha256(buf);
  await getBlobDriver().put(hash, buf);
  await db
    .insertInto("blobs")
    .values({
      hash,
      content_type: contentType,
      size: buf.byteLength,
      created_at: createdAt,
    })
    .onConflict((oc) => oc.column("hash").doNothing())
    .execute();
  return hash;
}

async function putAttachment(id: string, blobHash: string, deleted: 0 | 1) {
  await db
    .insertInto("attachments")
    .values({
      id,
      message_id: "m1",
      blob_hash: blobHash,
      file_name: "f.png",
      mime_type: "image/png",
      size: 1,
      created_at: OLD,
      updated_at: OLD,
      seq: 0,
      deleted,
    })
    .execute();
}

async function blobExists(hash: string): Promise<boolean> {
  const row = await db
    .selectFrom("blobs")
    .select("hash")
    .where("hash", "=", hash)
    .executeTakeFirst();
  return !!row;
}

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  await db.deleteFrom("attachments").execute();
  await db.deleteFrom("blob_thumbnails").execute();
  await db.deleteFrom("blobs").execute();
});

describe("blob gc", () => {
  it("keeps a blob referenced by a live attachment", async () => {
    const hash = await putBlob("live", OLD);
    await putAttachment("a1", hash, 0);

    const res = await runBlobGc(NOW);

    expect(res.deleted).toBe(0);
    expect(await blobExists(hash)).toBe(true);
  });

  it("sweeps an orphan past the grace period, with its thumbnail", async () => {
    const src = await putBlob("orphan", OLD);
    const thumb = await putBlob("orphan-thumb", OLD, "image/webp");
    await db
      .insertInto("blob_thumbnails")
      .values({
        source_hash: src,
        width: 400,
        thumb_hash: thumb,
        thumb_width: 400,
        thumb_height: 300,
        created_at: OLD,
      })
      .execute();
    await putAttachment("a1", src, 1); // soft-deleted

    const res = await runBlobGc(NOW);

    expect(res.deleted).toBe(2);
    expect(res.bytesReclaimed).toBeGreaterThan(0);
    expect(await blobExists(src)).toBe(false);
    expect(await blobExists(thumb)).toBe(false);
    expect(await getBlobDriver().get(src)).toBeNull();
    const thumbs = await db.selectFrom("blob_thumbnails").selectAll().execute();
    expect(thumbs).toHaveLength(0);
  });

  it("keeps a fresh orphan within the grace period", async () => {
    const hash = await putBlob("fresh-orphan", FRESH);

    const res = await runBlobGc(NOW);

    expect(res.deleted).toBe(0);
    expect(await blobExists(hash)).toBe(true);
  });

  it("keeps a blob shared by a live and a deleted attachment", async () => {
    const hash = await putBlob("shared", OLD);
    await putAttachment("live", hash, 0);
    await putAttachment("dead", hash, 1);

    const res = await runBlobGc(NOW);

    expect(res.deleted).toBe(0);
    expect(await blobExists(hash)).toBe(true);
  });

  it("keeps the thumbnail of a live source", async () => {
    const src = await putBlob("livesrc", OLD);
    const thumb = await putBlob("livesrc-thumb", OLD, "image/webp");
    await db
      .insertInto("blob_thumbnails")
      .values({
        source_hash: src,
        width: 400,
        thumb_hash: thumb,
        thumb_width: 400,
        thumb_height: 300,
        created_at: OLD,
      })
      .execute();
    await putAttachment("a1", src, 0);

    const res = await runBlobGc(NOW);

    expect(res.deleted).toBe(0);
    expect(await blobExists(thumb)).toBe(true);
  });
});
