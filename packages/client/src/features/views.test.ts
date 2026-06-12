import type { MessageDoc } from "@aside/shared";
import { describe, expect, it } from "vitest";
import { ALL_ID, computeCounts, matchesView } from "./views";

function message(overrides: Partial<MessageDoc> = {}): MessageDoc {
  return {
    id: "message-1",
    channelIds: ["general"],
    text: "hello",
    createdAt: 1,
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
});
