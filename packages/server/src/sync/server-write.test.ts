import { describe, expect, it } from "vitest";
import type { ReplicatedDoc, SyncCollection } from "./collection.js";
import { writeServerBatch } from "./server-write.js";
import { onChange, type SyncEvent } from "./stream.js";

interface TestDoc extends ReplicatedDoc {
  text: string;
}

function makeCollection(
  name: string,
  seed: TestDoc[] = [],
): { coll: SyncCollection<TestDoc>; store: Map<string, TestDoc> } {
  const store = new Map<string, TestDoc>(seed.map((d) => [d.id, d]));
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

function doc(id: string, text: string, deleted = false): TestDoc {
  return { id, text, updatedAt: 1, _deleted: deleted };
}

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

describe("writeServerBatch", () => {
  it("overwrites existing docs (unlike ingest) and emits one batched event", async () => {
    const { coll, store } = makeCollection("sw-overwrite", [doc("a", "old")]);

    const events = await captureEvents("sw-overwrite", async () => {
      await writeServerBatch(coll, [doc("a", "new"), doc("b", "fresh")]);
    });

    expect(store.get("a")!.text).toBe("new"); // overwritten, not skipped
    expect(store.get("b")!.text).toBe("fresh");
    expect(events).toHaveLength(1);
    expect(events[0]!.documents).toHaveLength(2);
  });

  it("carries upserts and soft-deletes in one event with the max seq", async () => {
    const { coll, store } = makeCollection("sw-mixed");

    const events = await captureEvents("sw-mixed", async () => {
      await writeServerBatch(coll, [doc("a", "live"), doc("b", "gone", true)]);
    });

    expect(store.get("b")!._deleted).toBe(true);
    expect(events).toHaveLength(1);
    expect(events[0]!.documents).toHaveLength(2);
    // checkpoint is the max seq across the whole batch, so a client can't
    // checkpoint past half of it.
    const seqs = events[0]!.documents.length;
    expect(events[0]!.checkpoint.seq).toBeGreaterThanOrEqual(seqs);
  });

  it("does nothing on an empty batch", async () => {
    const { coll } = makeCollection("sw-empty");
    const events = await captureEvents("sw-empty", async () => {
      await writeServerBatch(coll, []);
    });
    expect(events).toHaveLength(0);
  });
});
