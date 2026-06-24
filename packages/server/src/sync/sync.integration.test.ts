// Must be first: points the db singleton at in-memory SQLite before it loads.
import "../test/env.js";

import type { ReplicatedMessageDoc } from "@aside/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { initDb } from "../db/index.js";
import { messagesSync } from "./messages.js";
import { pull } from "./pull.js";
import { push } from "./push.js";
import { onChange, type SyncEvent } from "./stream.js";

/**
 * End-to-end of the sync protocol against the REAL `messagesSync` descriptor and
 * a real (in-memory) SQLite database — the layer the in-memory fakes in
 * `ingest.test.ts` deliberately skip. Covers the round-trip, incremental pulls,
 * conflict detection, soft-deletes, and stream fan-out: the path that "corrupts
 * silently" (per CLAUDE.md) if it ever regresses.
 */

let counter = 0;

function message(
  overrides: Partial<ReplicatedMessageDoc> = {},
): ReplicatedMessageDoc {
  counter += 1;
  return {
    id: `m${counter}`,
    channelIds: ["general"],
    text: `note ${counter}`,
    createdAt: 1000,
    dueAt: 0,
    updatedAt: 1000,
    _deleted: false,
    ...overrides,
  };
}

/** Push a single doc with no assumed master (a fresh insert). */
function pushInsert(doc: ReplicatedMessageDoc) {
  return push(messagesSync, [
    { newDocumentState: doc, assumedMasterState: null },
  ]);
}

/** Collect every stream event for the messages collection emitted during `fn`. */
async function captureEvents(fn: () => Promise<void>): Promise<SyncEvent[]> {
  const events: SyncEvent[] = [];
  const unsub = onChange("messages", (e) => events.push(e));
  try {
    await fn();
  } finally {
    unsub();
  }
  return events;
}

beforeAll(async () => {
  await initDb();
});

describe("sync protocol (messages, real SQLite)", () => {
  it("round-trips a pushed doc back through pull", async () => {
    const doc = message({ text: "hello" });
    const conflicts = await pushInsert(doc);
    expect(conflicts).toEqual([]);

    const result = await pull(messagesSync, {
      checkpoint: null,
      batchSize: 100,
    });
    const pulled = result.documents.find((d) => d.id === doc.id);
    expect(pulled).toMatchObject({
      id: doc.id,
      text: "hello",
      _deleted: false,
    });
    // The checkpoint advances to a server-assigned monotonic seq.
    expect(result.checkpoint?.seq).toBeGreaterThan(0);
  });

  it("returns only docs changed since the client's checkpoint", async () => {
    const a = message();
    await pushInsert(a);
    const first = await pull(messagesSync, {
      checkpoint: null,
      batchSize: 100,
    });
    const cp = first.checkpoint;

    const b = message();
    await pushInsert(b);

    const second = await pull(messagesSync, { checkpoint: cp, batchSize: 100 });
    expect(second.documents.map((d) => d.id)).toEqual([b.id]);
    expect(second.checkpoint?.seq).toBeGreaterThan(cp?.seq ?? 0);
  });

  it("detects conflicts on a stale assumed master and does not overwrite", async () => {
    const doc = message({ text: "v1" });
    await pushInsert(doc);

    // A second client edits assuming the doc never existed (assumed master null).
    const conflicting: ReplicatedMessageDoc = {
      ...doc,
      text: "v2",
      updatedAt: 2000,
    };
    const conflicts = await push(messagesSync, [
      { newDocumentState: conflicting, assumedMasterState: null },
    ]);

    // The real master comes back; the write is rejected.
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ id: doc.id, text: "v1" });
    expect(await messagesSync.fetchById(doc.id)).toMatchObject({ text: "v1" });
  });

  it("accepts an edit that supplies the correct assumed master", async () => {
    const doc = message({ text: "v1" });
    await pushInsert(doc);
    const master = await messagesSync.fetchById(doc.id);

    const edit: ReplicatedMessageDoc = { ...doc, text: "v2", updatedAt: 2000 };
    const conflicts = await push(messagesSync, [
      { newDocumentState: edit, assumedMasterState: master },
    ]);

    expect(conflicts).toEqual([]);
    expect(await messagesSync.fetchById(doc.id)).toMatchObject({ text: "v2" });
  });

  it("propagates a soft-delete and surfaces it in a later pull", async () => {
    const doc = message({ text: "to delete" });
    await pushInsert(doc);
    const master = await messagesSync.fetchById(doc.id);
    const baseline = await pull(messagesSync, {
      checkpoint: null,
      batchSize: 100,
    });

    // Deletes bump updatedAt so LWW sees them as a later change.
    const tombstone: ReplicatedMessageDoc = {
      ...doc,
      _deleted: true,
      updatedAt: 3000,
    };
    const conflicts = await push(messagesSync, [
      { newDocumentState: tombstone, assumedMasterState: master },
    ]);
    expect(conflicts).toEqual([]);

    const after = await pull(messagesSync, {
      checkpoint: baseline.checkpoint,
      batchSize: 100,
    });
    const seen = after.documents.find((d) => d.id === doc.id);
    expect(seen).toMatchObject({ id: doc.id, _deleted: true });
  });

  it("emits one batched stream event per push", async () => {
    const a = message();
    const b = message();
    const events = await captureEvents(async () => {
      await push(messagesSync, [
        { newDocumentState: a, assumedMasterState: null },
        { newDocumentState: b, assumedMasterState: null },
      ]);
    });

    expect(events).toHaveLength(1);
    const ids = (events[0]!.documents as ReplicatedMessageDoc[]).map(
      (d) => d.id,
    );
    expect(ids).toEqual([a.id, b.id]);
    expect(events[0]!.checkpoint.seq).toBeGreaterThan(0);
  });
});
