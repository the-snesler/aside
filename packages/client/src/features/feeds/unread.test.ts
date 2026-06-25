import type { ConfigDoc, MessageDoc } from "@aside/shared";
import { describe, expect, it } from "vitest";
import type { Feed } from "./api";
import { computeFeedUnread, readMarkers } from "./unread";

function message(overrides: Partial<MessageDoc>): MessageDoc {
  return {
    id: "tw:1",
    channelIds: ["links"],
    text: "hello",
    createdAt: 1,
    dueAt: 0,
    updatedAt: 10,
    ...overrides,
  };
}

function feed(overrides: Partial<Feed>): Feed {
  return {
    id: "feed-1",
    type: "twitter-bookmarks",
    channelId: "links",
    channelName: "links",
    cron: "0 * * * *",
    enabled: true,
    options: {},
    cursor: null,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function config(overrides: Partial<ConfigDoc>): ConfigDoc {
  return {
    id: "feed-read:links",
    value: JSON.stringify({ lastSeenUpdatedAt: 0 }),
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("computeFeedUnread", () => {
  it("marks a channel unread when a feed item is newer than its read marker", () => {
    const result = computeFeedUnread(
      [message({ updatedAt: 20 })],
      [feed({})],
      readMarkers([
        config({ value: JSON.stringify({ lastSeenUpdatedAt: 10 }) }),
      ]),
    );

    expect(result.unreadChannelIds.has("links")).toBe(true);
    expect(result.latestByChannel.get("links")).toBe(20);
  });

  it("ignores non-feed messages and wrong source prefixes", () => {
    const result = computeFeedUnread(
      [
        message({ id: "note-1", updatedAt: 20 }),
        message({ id: "rss:1", updatedAt: 30 }),
      ],
      [feed({ type: "twitter-bookmarks" })],
      new Map(),
    );

    expect(result.unreadChannelIds.size).toBe(0);
  });

  it("supports RSS feed prefixes", () => {
    const result = computeFeedUnread(
      [message({ id: "rss:1", updatedAt: 20 })],
      [feed({ type: "rss" })],
      new Map(),
    );

    expect(result.unreadChannelIds.has("links")).toBe(true);
  });
});
