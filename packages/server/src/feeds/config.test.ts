import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  updatedSet: null as Record<string, unknown> | null,
  row: {
    id: "feed-1",
    type: "rss",
    channel_id: "old-channel",
    channel_name: "old-channel",
    cron: "0 * * * *",
    enabled: 1,
    config: "{}",
    cursor: null,
    last_run_at: null,
    last_status: null,
    last_error: null,
    created_at: 1,
    updated_at: 1,
  },
}));

vi.mock("../db/index.js", () => ({
  db: {
    updateTable: () => ({
      set: (set: Record<string, unknown>) => {
        state.updatedSet = set;
        return {
          where: () => ({
            execute: async () => undefined,
          }),
        };
      },
    }),
    selectFrom: () => ({
      selectAll: () => ({
        where: () => ({
          executeTakeFirst: async () => ({
            ...state.row,
            channel_id:
              typeof state.updatedSet?.channel_id === "string"
                ? state.updatedSet.channel_id
                : state.row.channel_id,
            channel_name:
              typeof state.updatedSet?.channel_name === "string"
                ? state.updatedSet.channel_name
                : state.row.channel_name,
          }),
        }),
        orderBy: () => ({
          execute: async () => [],
        }),
      }),
    }),
  },
}));

describe("feed config", () => {
  beforeEach(() => {
    state.updatedSet = null;
  });

  it("patches the output channel id", async () => {
    const { updateFeed } = await import("./config.js");

    const feed = await updateFeed("feed-1", {
      channelId: "existing-channel",
      channelName: "Existing Channel",
    });

    expect(state.updatedSet).toMatchObject({
      channel_id: "existing-channel",
      channel_name: "existing-channel",
    });
    expect(feed).toMatchObject({
      channelId: "existing-channel",
      channelName: "existing-channel",
    });
  });
});
