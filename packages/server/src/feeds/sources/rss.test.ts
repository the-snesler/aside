import { describe, expect, it } from "vitest";
import type { FeedConfig } from "../types.js";
import { parseRssFeed } from "./rss.js";

function feed(overrides: Partial<FeedConfig> = {}): FeedConfig {
  return {
    id: "feed-1",
    type: "rss",
    channelId: "links",
    channelName: "links",
    cron: "0 * * * *",
    enabled: true,
    options: { url: "https://example.com/feed.xml", maxItems: 200 },
    cursor: null,
    lastRunAt: null,
    lastStatus: null,
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("parseRssFeed", () => {
  it("imports RSS item title and link", () => {
    const result = parseRssFeed(
      `<rss><channel><item>
        <title>First post</title>
        <link>https://example.com/first</link>
        <guid>first-guid</guid>
        <pubDate>Fri, 01 Mar 2024 12:00:00 GMT</pubDate>
      </item></channel></rss>`,
      feed(),
      99,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      text: "First post\n\nhttps://example.com/first",
      url: "https://example.com/first",
      createdAt: Date.parse("Fri, 01 Mar 2024 12:00:00 GMT"),
    });
    expect(result.cursor.lastItemId).toBe(result.items[0]!.externalId);
  });

  it("imports Atom entries", () => {
    const result = parseRssFeed(
      `<feed>
        <entry>
          <title>Atom post</title>
          <id>tag:example.com,2024:atom</id>
          <link href="/atom-post" />
          <updated>2024-03-02T10:30:00Z</updated>
        </entry>
      </feed>`,
      feed(),
      99,
    );

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      text: "Atom post\n\nhttps://example.com/atom-post",
      url: "https://example.com/atom-post",
      createdAt: Date.parse("2024-03-02T10:30:00Z"),
    });
  });

  it("stops when it reaches the previous cursor", () => {
    const firstRun = parseRssFeed(twoItemsXml(), feed(), 99);
    const secondRun = parseRssFeed(
      twoItemsXml(),
      feed({ cursor: { lastItemId: firstRun.items[0]!.externalId } }),
      99,
    );

    expect(secondRun.items).toEqual([]);
    expect(secondRun.cursor.lastItemId).toBe(firstRun.items[0]!.externalId);
  });

  it("limits first import with maxItems", () => {
    const result = parseRssFeed(
      twoItemsXml(),
      feed({ options: { url: "https://example.com/feed.xml", maxItems: 1 } }),
      99,
    );

    expect(result.items.map((item) => item.url)).toEqual([
      "https://example.com/first",
    ]);
  });
});

function twoItemsXml(): string {
  return `<rss><channel>
    <item><title>First</title><link>https://example.com/first</link><guid>first</guid></item>
    <item><title>Second</title><link>https://example.com/second</link><guid>second</guid></item>
  </channel></rss>`;
}
