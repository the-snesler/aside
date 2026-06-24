// Must be first: points the db singleton at in-memory SQLite before it loads.
import "./test/env.js";

import type { ReplicatedMessageDoc } from "@aside/shared";
import type { Hono } from "hono";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";
import { initDb } from "./db/index.js";

/**
 * In-process HTTP end-to-end: drives the REAL Hono app (routing + auth
 * middleware + sync handlers + SQLite) via `app.request(...)`, no port bound and
 * no schedulers started. Proves the wiring a unit test can't: that an
 * authenticated client can push a note over HTTP and pull it back, and that the
 * auth gate actually guards the sync endpoints.
 */

let app: Hono;
let token: string;

function json(body: unknown, token?: string): RequestInit {
  return {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
}

function message(): ReplicatedMessageDoc {
  return {
    id: "e2e-1",
    channelIds: ["general"],
    text: "hello over http",
    createdAt: 1000,
    dueAt: 2000,
    updatedAt: 1000,
    _deleted: false,
  };
}

beforeAll(async () => {
  await initDb();
  app = createApp();
  // First boot: claim the owner account and keep the session token.
  const res = await app.request("/api/auth/setup", json({ password: "admin" }));
  expect(res.status).toBe(201);
  token = ((await res.json()) as { token: string }).token;
});

describe("app e2e (HTTP)", () => {
  it("serves health without auth", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("rejects unauthenticated sync requests", async () => {
    const res = await app.request(
      "/api/sync/messages/pull",
      json({ checkpoint: null, batchSize: 100 }),
    );
    expect(res.status).toBe(401);
  });

  it("pushes and pulls a message for an authenticated client", async () => {
    const doc = message();

    const pushRes = await app.request(
      "/api/sync/messages/push",
      json([{ newDocumentState: doc, assumedMasterState: null }], token),
    );
    expect(pushRes.status).toBe(200);
    // No conflicts on a fresh insert.
    expect(await pushRes.json()).toEqual([]);

    const pullRes = await app.request(
      "/api/sync/messages/pull",
      json({ checkpoint: null, batchSize: 100 }, token),
    );
    expect(pullRes.status).toBe(200);
    const result = (await pullRes.json()) as {
      documents: ReplicatedMessageDoc[];
      checkpoint: { seq: number } | null;
    };
    expect(result.documents.map((d) => d.id)).toContain(doc.id);
    expect(result.checkpoint?.seq).toBeGreaterThan(0);
  });
});
