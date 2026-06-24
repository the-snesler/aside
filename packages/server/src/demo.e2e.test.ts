// Must be first: points the db singleton at in-memory SQLite + a tmp blob dir.
import "./test/env.js";

import type { Hono } from "hono";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { initDb } from "./db/index.js";

let app: Hono;

/** A push body for one brand-new doc (no assumed master state). */
function pushOne(doc: unknown): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify([{ newDocumentState: doc, assumedMasterState: null }]),
    headers: { "content-type": "application/json" },
  };
}

beforeAll(async () => {
  process.env.DEMO_MODE = "1";
  await initDb();
  app = createApp();
});

afterAll(() => {
  delete process.env.DEMO_MODE;
});

describe("demo mode", () => {
  it("reports an authenticated demo session with no token", async () => {
    const res = await app.request("/api/auth/status");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      setupRequired: false,
      authenticated: true,
      demo: true,
    });
  });

  it("blocks password setup/login", async () => {
    const setup = await app.request("/api/auth/setup", {
      method: "POST",
      body: JSON.stringify({ password: "x" }),
      headers: { "content-type": "application/json" },
    });
    expect(setup.status).toBe(403);
  });

  it("allows writing messages without a token", async () => {
    const now = Date.now();
    const doc = {
      id: "demo-test-msg",
      channelIds: ["general"],
      text: "a visitor note",
      createdAt: now,
      dueAt: 0,
      updatedAt: now,
      _deleted: false,
    };
    const push = await app.request("/api/sync/messages/push", pushOne(doc));
    expect(push.status).toBe(200);
    expect(await push.json()).toEqual([]); // no conflicts

    const pull = await app.request("/api/sync/messages/pull", {
      method: "POST",
      body: JSON.stringify({ checkpoint: null }),
      headers: { "content-type": "application/json" },
    });
    const body = (await pull.json()) as { documents: Array<{ id: string }> };
    expect(body.documents.map((d) => d.id)).toContain("demo-test-msg");
  });

  it("allows writing channels and config", async () => {
    const now = Date.now();
    const channel = await app.request(
      "/api/sync/channels/push",
      pushOne({
        id: "demo-test-ch",
        name: "scratch",
        createdAt: now,
        updatedAt: now,
        _deleted: false,
      }),
    );
    expect(channel.status).toBe(200);

    const config = await app.request(
      "/api/sync/config/push",
      pushOne({
        id: "theme",
        value: "{}",
        createdAt: now,
        updatedAt: now,
        _deleted: false,
      }),
    );
    expect(config.status).toBe(200);
  });

  it("blocks attachment metadata writes", async () => {
    const now = Date.now();
    const res = await app.request(
      "/api/sync/attachments/push",
      pushOne({
        id: "demo-test-att",
        messageId: "demo-test-msg",
        blobHash: "deadbeef",
        fileName: "x.png",
        mimeType: "image/png",
        size: 1,
        createdAt: now,
        updatedAt: now,
        _deleted: false,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("blocks blob uploads, storage deletes, feeds, and AI", async () => {
    const upload = await app.request("/api/blobs", {
      method: "POST",
      body: new Uint8Array([1, 2, 3]),
      headers: { "content-type": "image/png" },
    });
    expect(upload.status).toBe(403);

    const del = await app.request("/api/storage/attachments/delete", {
      method: "POST",
      body: JSON.stringify({ ids: ["x"] }),
      headers: { "content-type": "application/json" },
    });
    expect(del.status).toBe(403);

    const feed = await app.request("/api/feeds", {
      method: "POST",
      body: JSON.stringify({ type: "rss", channelName: "x" }),
      headers: { "content-type": "application/json" },
    });
    expect(feed.status).toBe(403);

    const ai = await app.request("/api/ai/config", {
      method: "PATCH",
      body: JSON.stringify({ organizerEnabled: true }),
      headers: { "content-type": "application/json" },
    });
    expect(ai.status).toBe(403);
  });

  it("still serves read-only endpoints", async () => {
    const usage = await app.request("/api/storage/usage");
    expect(usage.status).toBe(200);
    const feeds = await app.request("/api/feeds");
    expect(feeds.status).toBe(200);
  });
});
