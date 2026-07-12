// Must be first: points the db singleton at in-memory SQLite before it loads.
import "../test/env.js";

import type { ReplicatedChannelDoc } from "@aside/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { initDb } from "../db/index.js";
import { channelsSync } from "./channels.js";
import { push } from "./push.js";

/**
 * Regression coverage for the channels upsert against the REAL `channelsSync`
 * descriptor and a real (in-memory) SQLite database, modeled on
 * `sync.integration.test.ts`. The channels upsert historically only listed a
 * subset of columns in its `ON CONFLICT DO UPDATE SET`, so edits to
 * `color`/`type`/`pinnedMessageIds`/`sortOrder` on an existing channel were
 * silently dropped on every push after the first insert.
 */

let counter = 0;

function channel(
  overrides: Partial<ReplicatedChannelDoc> = {},
): ReplicatedChannelDoc {
  counter += 1;
  return {
    id: `c${counter}`,
    name: `channel-${counter}`,
    color: "#ff0000",
    type: "standard",
    pinnedMessageIds: ["m1"],
    sortOrder: 1,
    createdAt: 1000,
    updatedAt: 1000,
    _deleted: false,
    ...overrides,
  };
}

/** Push a single doc with no assumed master (a fresh insert). */
function pushInsert(doc: ReplicatedChannelDoc) {
  return push(channelsSync, [
    { newDocumentState: doc, assumedMasterState: null },
  ]);
}

beforeAll(async () => {
  await initDb();
});

describe("sync protocol (channels, real SQLite)", () => {
  it("round-trips a freshly inserted channel's color/type/pins/order", async () => {
    const doc = channel({
      color: "#123456",
      type: "todo",
      pinnedMessageIds: ["m1", "m2"],
      sortOrder: 5,
    });
    const conflicts = await pushInsert(doc);
    expect(conflicts).toEqual([]);

    const fetched = await channelsSync.fetchById(doc.id);
    expect(fetched).toMatchObject({
      color: "#123456",
      type: "todo",
      pinnedMessageIds: ["m1", "m2"],
      sortOrder: 5,
    });
  });

  it("persists an update to color/type/pins/order on an existing channel", async () => {
    const doc = channel({
      color: "#111111",
      type: "standard",
      pinnedMessageIds: ["m1"],
      sortOrder: 1,
    });
    await pushInsert(doc);
    const master = await channelsSync.fetchById(doc.id);

    // Change all four fields on top of the accepted master, so the update
    // takes the ON CONFLICT DO UPDATE path (not the initial INSERT path).
    const edit: ReplicatedChannelDoc = {
      ...doc,
      color: "#00ff00",
      type: "todo",
      pinnedMessageIds: ["m2", "m3"],
      sortOrder: 42,
      updatedAt: 2000,
    };
    const conflicts = await push(channelsSync, [
      { newDocumentState: edit, assumedMasterState: master },
    ]);
    expect(conflicts).toEqual([]);

    // This is the exact assertion that fails against the pre-fix upsert: the
    // push is accepted with no conflict, but color/type/pinnedMessageIds/
    // sortOrder silently keep their original values because doUpdateSet
    // omitted those columns.
    const fetched = await channelsSync.fetchById(doc.id);
    expect(fetched).toMatchObject({
      color: "#00ff00",
      type: "todo",
      pinnedMessageIds: ["m2", "m3"],
      sortOrder: 42,
    });
  });
});
