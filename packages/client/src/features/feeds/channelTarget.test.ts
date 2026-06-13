import { describe, expect, it } from "vitest";
import type { ChannelDoc } from "@aside/shared";
import { resolveFeedChannelTarget } from "./channelTarget";

function channel(overrides: Partial<ChannelDoc>): ChannelDoc {
  return {
    id: "c1",
    name: "links",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("resolveFeedChannelTarget", () => {
  it("links to an existing channel by slugified name", () => {
    expect(
      resolveFeedChannelTarget("Links!", [channel({ id: "links" })]),
    ).toEqual({
      channelId: "links",
      channelName: "links",
    });
  });

  it("uses default channel first when duplicate names exist", () => {
    expect(
      resolveFeedChannelTarget("general", [
        channel({ id: "later", name: "general", createdAt: 2 }),
        channel({ id: "general", name: "general", createdAt: 10 }),
      ]),
    ).toEqual({
      channelId: "general",
      channelName: "general",
    });
  });
});
