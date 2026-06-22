import { describe, expect, it } from "vitest";
import type { ChannelsTable } from "../db/types.js";
import { channelDocToRow, channelRowToDoc } from "./row.js";

function channelRow(overrides: Partial<ChannelsTable> = {}): ChannelsTable {
  return {
    id: "channel-1",
    name: "general",
    description: null,
    color: null,
    type: null,
    pinned_message_ids: null,
    sort_order: null,
    created_at: 1,
    updated_at: 2,
    seq: 3,
    deleted: 0,
    ...overrides,
  };
}

describe("channel row mapping", () => {
  it("maps optional channel settings between rows and docs", () => {
    const doc = channelRowToDoc(
      channelRow({
        description: "Things to do",
        color: "#123abc",
        type: "todo",
        pinned_message_ids: JSON.stringify(["m1", "m2"]),
        sort_order: 7,
      }),
    );

    expect(doc).toEqual({
      id: "channel-1",
      name: "general",
      description: "Things to do",
      color: "#123abc",
      type: "todo",
      pinnedMessageIds: ["m1", "m2"],
      sortOrder: 7,
      createdAt: 1,
      updatedAt: 2,
      _deleted: false,
    });

    expect(channelDocToRow(doc, 9)).toEqual({
      id: "channel-1",
      name: "general",
      description: "Things to do",
      color: "#123abc",
      type: "todo",
      pinned_message_ids: JSON.stringify(["m1", "m2"]),
      sort_order: 7,
      created_at: 1,
      updated_at: 2,
      seq: 9,
      deleted: 0,
    });
  });

  it("omits invalid nullable row fields from the replication doc", () => {
    expect(
      channelRowToDoc(
        channelRow({
          type: "future",
          pinned_message_ids: "{not-json",
        }),
      ),
    ).toEqual({
      id: "channel-1",
      name: "general",
      createdAt: 1,
      updatedAt: 2,
      _deleted: false,
    });
  });
});
