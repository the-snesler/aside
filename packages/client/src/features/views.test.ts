import type { MessageDoc } from "@aside/shared";
import { describe, expect, it } from "vitest";
import {
  ALL_ID,
  REMINDERS_ID,
  TASKS_ID,
  computeCounts,
  hasOpenTask,
  matchesView,
} from "./views";

function message(overrides: Partial<MessageDoc> = {}): MessageDoc {
  return {
    id: "message-1",
    channelIds: ["general"],
    text: "hello",
    createdAt: 1,
    dueAt: 0,
    updatedAt: 2,
    ...overrides,
  };
}

describe("message views", () => {
  it("matches every channel a message belongs to", () => {
    const doc = message({ channelIds: ["general", "links"] });

    expect(matchesView("general", doc, new Set())).toBe(true);
    expect(matchesView("links", doc, new Set())).toBe(true);
    expect(matchesView("other", doc, new Set())).toBe(false);
  });

  it("counts a multi-channel message once per channel and once globally", () => {
    const doc = message({ channelIds: ["general", "links"] });

    const counts = computeCounts([doc], new Set());

    expect(counts.all).toBe(1);
    expect(counts.byChannel.get("general")).toBe(1);
    expect(counts.byChannel.get("links")).toBe(1);
  });

  it("hides a message from channels no longer in its membership", () => {
    const doc = message({ channelIds: ["links"] });

    expect(matchesView("general", doc, new Set())).toBe(false);
    expect(matchesView("links", doc, new Set())).toBe(true);
    expect(matchesView(ALL_ID, doc, new Set())).toBe(true);
  });

  it("detects unchecked markdown tasks", () => {
    expect(hasOpenTask("- [ ] follow up")).toBe(true);
    expect(hasOpenTask("1. [ ] ordered task")).toBe(true);
    expect(hasOpenTask("- [x] already done")).toBe(false);
    expect(hasOpenTask("just [ ] brackets")).toBe(false);
  });

  it("matches task and reminder smart views", () => {
    const task = message({ text: "- [ ] follow up" });
    const reminder = message({ dueAt: 2_000 });

    expect(matchesView(TASKS_ID, task, new Set())).toBe(true);
    expect(
      matchesView(TASKS_ID, message({ text: "- [x] done" }), new Set()),
    ).toBe(false);
    expect(matchesView(REMINDERS_ID, reminder, new Set(), 1_000)).toBe(true);
    expect(matchesView(REMINDERS_ID, reminder, new Set(), 3_000)).toBe(false);
  });

  it("counts open tasks and upcoming reminders", () => {
    const counts = computeCounts(
      [
        message({ id: "task", text: "- [ ] call back" }),
        message({ id: "done", text: "- [x] shipped" }),
        message({ id: "reminder", dueAt: Date.now() + 60_000 }),
        message({ id: "past", dueAt: 1 }),
      ],
      new Set(),
    );

    expect(counts.tasks).toBe(1);
    expect(counts.reminders).toBe(1);
  });
});
