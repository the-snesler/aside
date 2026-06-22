import { describe, expect, it } from "vitest";
import type { ChannelDoc } from "@aside/shared";
import {
  channelColor,
  channelType,
  nextSortOrder,
  pinnedMessageIds,
  sortChannels,
} from "./channelMeta";

function channel(overrides: Partial<ChannelDoc>): ChannelDoc {
  return {
    id: "channel",
    name: "general",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("channel metadata helpers", () => {
  it("uses an explicit channel color before the generated fallback", () => {
    const generated = channelColor(channel({ name: "work" }));
    expect(channelColor(channel({ name: "work", color: "#123abc" }))).toBe(
      "#123abc",
    );
    expect(channelColor(channel({ name: "work", color: "blue" }))).toBe(
      generated,
    );
  });

  it("falls back to standard type and empty pins", () => {
    expect(channelType(channel({}))).toBe("standard");
    expect(channelType(channel({ type: "todo" }))).toBe("todo");
    expect(pinnedMessageIds(channel({}))).toEqual([]);
    expect(pinnedMessageIds(channel({ pinnedMessageIds: ["m1"] }))).toEqual([
      "m1",
    ]);
  });

  it("sorts by explicit order with createdAt fallback", () => {
    expect(
      sortChannels([
        channel({ id: "late", createdAt: 30 }),
        channel({ id: "general", createdAt: 99 }),
        channel({ id: "ordered", createdAt: 40, sortOrder: 1 }),
        channel({ id: "early", createdAt: 10 }),
      ]).map((item) => item.id),
    ).toEqual(["general", "ordered", "early", "late"]);
  });

  it("places new channels after existing explicit and fallback order keys", () => {
    expect(
      nextSortOrder([
        channel({ createdAt: 10 }),
        channel({ createdAt: 20, sortOrder: 50 }),
      ]),
    ).toBe(51);
  });

  it("lets the default channel move once it has explicit order", () => {
    expect(
      sortChannels([
        channel({ id: "general", createdAt: 1, sortOrder: 3 }),
        channel({ id: "work", createdAt: 2, sortOrder: 1 }),
      ]).map((item) => item.id),
    ).toEqual(["work", "general"]);
  });
});
