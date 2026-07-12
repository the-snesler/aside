// Must be first: points the db singleton at in-memory SQLite before it loads.
import "../test/env.js";

import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, initDb } from "../db/index.js";
import { runDueReminderSweep, tick } from "./worker.js";

const h = vi.hoisted(() => ({
  sendPushToAll: vi.fn(),
}));

vi.mock("../notifications/push.js", () => ({
  sendPushToAll: h.sendPushToAll,
}));

beforeAll(async () => {
  await initDb();
});

beforeEach(async () => {
  h.sendPushToAll.mockReset();
  await db.deleteFrom("reminder_deliveries").execute();
  await db.deleteFrom("messages").execute();
});

describe("runDueReminderSweep", () => {
  it("leaves a due reminder eligible when no subscription receives it", async () => {
    await insertMessage({ id: "m1", dueAt: 1000 });
    h.sendPushToAll.mockResolvedValue({
      success: 0,
      failure: 0,
      lastError: null,
    });

    expect(await runDueReminderSweep(1000)).toEqual({
      checked: 1,
      delivered: 0,
    });
    expect(await deliveryIds()).toEqual([]);
  });

  it("records one delivery after a successful push", async () => {
    await insertMessage({ id: "m1", dueAt: 1000 });
    h.sendPushToAll.mockResolvedValue({
      success: 1,
      failure: 0,
      lastError: null,
    });

    expect(await runDueReminderSweep(1000)).toEqual({
      checked: 1,
      delivered: 1,
    });
    expect(await deliveryIds()).toEqual(["m1:1000"]);

    await runDueReminderSweep(2000);
    expect(h.sendPushToAll).toHaveBeenCalledTimes(1);
  });

  it("sends again when the message due date changes", async () => {
    await insertMessage({ id: "m1", dueAt: 1000 });
    h.sendPushToAll.mockResolvedValue({
      success: 1,
      failure: 0,
      lastError: null,
    });

    await runDueReminderSweep(1000);
    await db
      .updateTable("messages")
      .set({ due_at: 2000, updated_at: 2000 })
      .where("id", "=", "m1")
      .execute();
    await runDueReminderSweep(2000);

    expect(h.sendPushToAll).toHaveBeenCalledTimes(2);
    expect(await deliveryIds()).toEqual(["m1:1000", "m1:2000"]);
  });

  it("ignores deleted and future reminders", async () => {
    await insertMessage({ id: "deleted", dueAt: 1000, deleted: true });
    await insertMessage({ id: "future", dueAt: 2000 });
    h.sendPushToAll.mockResolvedValue({
      success: 1,
      failure: 0,
      lastError: null,
    });

    expect(await runDueReminderSweep(1000)).toEqual({
      checked: 0,
      delivered: 0,
    });
    expect(h.sendPushToAll).not.toHaveBeenCalled();
  });
});

describe("tick", () => {
  it("skips a second tick while the first sweep is still running", async () => {
    await insertMessage({ id: "m1", dueAt: 1 });
    let resolveStuck!: (result: {
      success: number;
      failure: number;
      lastError: string | null;
    }) => void;
    const stuck = new Promise<{
      success: number;
      failure: number;
      lastError: string | null;
    }>((resolve) => {
      resolveStuck = resolve;
    });
    h.sendPushToAll.mockReturnValue(stuck);

    const first = tick();
    await vi.waitFor(() => expect(h.sendPushToAll).toHaveBeenCalledTimes(1));

    await tick();
    expect(h.sendPushToAll).toHaveBeenCalledTimes(1);

    resolveStuck({ success: 1, failure: 0, lastError: null });
    await first;
  });

  it("swallows a sweep error and resets the running flag for the next tick", async () => {
    await insertMessage({ id: "m1", dueAt: 1 });
    h.sendPushToAll.mockRejectedValueOnce(new Error("boom"));

    await expect(tick()).resolves.toBeUndefined();
    expect(await deliveryIds()).toEqual([]);

    h.sendPushToAll.mockResolvedValue({
      success: 1,
      failure: 0,
      lastError: null,
    });
    await tick();

    expect(await deliveryIds()).toEqual(["m1:1"]);
  });
});

async function insertMessage({
  id,
  dueAt,
  deleted = false,
}: {
  id: string;
  dueAt: number;
  deleted?: boolean;
}) {
  await db
    .insertInto("messages")
    .values({
      id,
      channel_id: "general",
      channel_ids: JSON.stringify(["general"]),
      text: `message ${id}`,
      created_at: 1,
      due_at: dueAt,
      updated_at: 1,
      seq: 1,
      deleted: deleted ? 1 : 0,
    })
    .execute();
}

async function deliveryIds(): Promise<string[]> {
  const rows = await db
    .selectFrom("reminder_deliveries")
    .select("id")
    .orderBy("id", "asc")
    .execute();
  return rows.map((row) => row.id);
}
