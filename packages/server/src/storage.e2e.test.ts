// Must be first: points the db singleton at in-memory SQLite + a tmp blob dir.
import "./test/env.js";

import type { Hono } from "hono";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { db, initDb } from "./db/index.js";

let app: Hono;
let token: string;

function auth(init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` },
  };
}

async function jsonPost(path: string, body: unknown): Promise<Response> {
  return await app.request(
    path,
    auth({
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
  );
}

async function uploadBlob(bytes: Buffer, contentType: string): Promise<string> {
  const res = await app.request(
    "/api/blobs",
    auth({
      method: "POST",
      body: new Uint8Array(bytes),
      headers: { "content-type": contentType },
    }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { hash: string }).hash;
}

beforeAll(async () => {
  await initDb();
  app = createApp();
  const res = await app.request("/api/auth/setup", {
    method: "POST",
    body: JSON.stringify({ password: "admin" }),
    headers: { "content-type": "application/json" },
  });
  token = ((await res.json()) as { token: string }).token;
});

interface UsageBody {
  blobs: {
    total: { count: number; bytes: number };
    byCategory: Array<{ category: string; count: number; bytes: number }>;
  };
  text: { messages: number; channels: number; embeds: number };
}

describe("storage api (HTTP)", () => {
  it("reports usage broken down by file type", async () => {
    const png = await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: { r: 1, g: 2, b: 3 },
      },
    })
      .png()
      .toBuffer();
    await uploadBlob(png, "image/png");
    await uploadBlob(Buffer.from("%PDF-1.4 not really a pdf"), "application/pdf");

    const res = await app.request("/api/storage/usage", auth());
    expect(res.status).toBe(200);
    const usage = (await res.json()) as UsageBody;

    const byCat = Object.fromEntries(
      usage.blobs.byCategory.map((c) => [c.category, c]),
    );
    expect(byCat.image!.count).toBeGreaterThanOrEqual(1);
    expect(byCat.image!.bytes).toBeGreaterThan(0);
    expect(byCat.pdf!.count).toBeGreaterThanOrEqual(1);
    expect(usage.blobs.total.count).toBeGreaterThanOrEqual(2);
  });

  it("bulk-deletes attachments by soft-deleting them server-side", async () => {
    const png = await sharp({
      create: {
        width: 32,
        height: 32,
        channels: 3,
        background: { r: 9, g: 9, b: 9 },
      },
    })
      .png()
      .toBuffer();
    const hash = await uploadBlob(png, "image/png");

    const attId = "att-del-1";
    const pushRes = await jsonPost("/api/sync/attachments/push", [
      {
        newDocumentState: {
          id: attId,
          messageId: "m1",
          blobHash: hash,
          fileName: "a.png",
          mimeType: "image/png",
          size: png.byteLength,
          createdAt: 1000,
          updatedAt: 1000,
          _deleted: false,
        },
        assumedMasterState: null,
      },
    ]);
    expect(pushRes.status).toBe(200);

    const before = await db
      .selectFrom("attachments")
      .select("deleted")
      .where("id", "=", attId)
      .executeTakeFirst();
    expect(before?.deleted).toBe(0);

    const res = await jsonPost("/api/storage/attachments/delete", {
      ids: [attId],
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { deleted: number }).deleted).toBe(1);

    const after = await db
      .selectFrom("attachments")
      .select("deleted")
      .where("id", "=", attId)
      .executeTakeFirst();
    expect(after?.deleted).toBe(1);
  });
});
