import { describe, expect, it } from "vitest";
import type { ReplicatedDoc, SyncCollection } from "./collection.js";
import { ingestNewBatch } from "./ingest.js";
import { onChange, type SyncEvent } from "./stream.js";

interface TestDoc extends ReplicatedDoc {
  text: string;
}

/** An in-memory SyncCollection so the helper is tested without SQLite. */
function makeCollection(
  name: string,
  seed: Array<{ doc: TestDoc; seq: number }> = [],
): { coll: SyncCollection<TestDoc>; store: Map<string, TestDoc> } {
  const store = new Map<string, TestDoc>(seed.map((e) => [e.doc.id, e.doc]));
  const coll: SyncCollection<TestDoc> = {
    name,
    parse: (input) => input as TestDoc,
    fetchSince: async () => [],
    fetchById: async (id) => store.get(id) ?? null,
    upsert: async (doc) => {
      store.set(doc.id, doc);
    },
  };
  return { coll, store };
}

function doc(id: string, deleted = false): TestDoc {
  return { id, text: id, updatedAt: 1, _deleted: deleted };
}

/** Collect every stream event emitted for a collection during `fn`. */
async function captureEvents(
  name: string,
  fn: () => Promise<void>,
): Promise<SyncEvent[]> {
  const events: SyncEvent[] = [];
  const unsub = onChange(name, (e) => events.push(e));
  try {
    await fn();
  } finally {
    unsub();
  }
  return events;
}

describe("ingestNewBatch", () => {
  it("writes new docs once and emits a single batched event", async () => {
    const { coll, store } = makeCollection("ingest-test-new");

    const events = await captureEvents("ingest-test-new", async () => {
      const written = await ingestNewBatch(coll, [doc("a"), doc("b")]);
      expect(written.map((d) => d.id)).toEqual(["a", "b"]);
    });

    expect(store.size).toBe(2);
    expect(events).toHaveLength(1);
    expect(events[0]!.documents).toHaveLength(2);
    // checkpoint carries the latest (max) assigned seq
    expect(events[0]!.checkpoint.seq).toBeGreaterThan(0);
  });

  it("is idempotent: re-ingesting existing ids writes and emits nothing", async () => {
    const { coll, store } = makeCollection("ingest-test-idempotent");

    await ingestNewBatch(coll, [doc("a"), doc("b")]);

    const events = await captureEvents("ingest-test-idempotent", async () => {
      const written = await ingestNewBatch(coll, [doc("a"), doc("b")]);
      expect(written).toHaveLength(0);
    });

    expect(store.size).toBe(2);
    expect(events).toHaveLength(0);
  });

  it("skips an id that exists as a soft-deleted row (no resurrection)", async () => {
    const deleted = doc("x", true);
    const { coll, store } = makeCollection("ingest-test-deleted", [
      { doc: deleted, seq: 5 },
    ]);

    const events = await captureEvents("ingest-test-deleted", async () => {
      const written = await ingestNewBatch(coll, [doc("x")]);
      expect(written).toHaveLength(0);
    });

    // the soft-deleted doc is untouched — not overwritten by the live one
    expect(store.get("x")).toBe(deleted);
    expect(store.get("x")!._deleted).toBe(true);
    expect(events).toHaveLength(0);
  });
});
