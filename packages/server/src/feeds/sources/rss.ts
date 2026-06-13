import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import type {
  FeedConfig,
  FeedFetchResult,
  FeedItem,
  FeedSource,
} from "../types.js";

const DEFAULT_MAX_ITEMS = 200;

type XmlRecord = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
});

export const rssSource: FeedSource = {
  type: "rss",
  idPrefix: "rss",

  async fetchItems(feed: FeedConfig): Promise<FeedFetchResult> {
    const url = stringOption(feed.options.url);
    if (!url) throw new Error("RSS feed URL is required.");

    const res = await fetch(url, {
      headers: { accept: "application/rss+xml, application/atom+xml, text/xml" },
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`RSS fetch failed: ${res.status}`);

    return parseRssFeed(await res.text(), feed, Date.now());
  },
};

export function parseRssFeed(
  xml: string,
  feed: FeedConfig,
  now: number,
): FeedFetchResult {
  const url = stringOption(feed.options.url);
  if (!url) throw new Error("RSS feed URL is required.");

  const maxItems = numberOption(feed.options.maxItems, DEFAULT_MAX_ITEMS);
  const stopAtId =
    typeof feed.cursor?.lastItemId === "string"
      ? feed.cursor.lastItemId
      : null;

  const parsed = parser.parse(xml) as XmlRecord;
  const rawItems = extractEntries(parsed);
  const items: FeedItem[] = [];
  let reachedCursor = false;

  for (const raw of rawItems) {
    const item = normalizeEntry(raw, url, now);
    if (!item) continue;
    if (stopAtId && item.externalId === stopAtId) {
      reachedCursor = true;
      break;
    }
    items.push(item);
    if (items.length >= maxItems) break;
  }

  const lastItemId = items[0]?.externalId ?? stopAtId ?? null;
  return {
    items,
    cursor: { lastItemId, reachedCursor },
  };
}

function extractEntries(parsed: XmlRecord): XmlRecord[] {
  const rss = asRecord(parsed.rss);
  const channel = asRecord(rss?.channel ?? parsed.channel);
  const rssItems = toArray(channel?.item).map(asRecord).filter(isRecord);
  if (rssItems.length > 0) return rssItems;

  const feed = asRecord(parsed.feed);
  return toArray(feed?.entry).map(asRecord).filter(isRecord);
}

function normalizeEntry(
  raw: XmlRecord,
  feedUrl: string,
  now: number,
): FeedItem | null {
  const link = normalizeLink(raw.link, feedUrl);
  if (!link) return null;

  const title = asText(raw.title).trim();
  const stableKey =
    asText(raw.guid).trim() ||
    asText(raw.id).trim() ||
    link ||
    `${title}:${asText(raw.pubDate) || asText(raw.updated)}`;
  const externalId = hash(`${feedUrl}:${stableKey}`);
  const date =
    parseDate(raw.pubDate) ??
    parseDate(raw.published) ??
    parseDate(raw.updated) ??
    now;

  return {
    externalId,
    url: link,
    text: title ? `${title}\n\n${link}` : link,
    createdAt: date,
  };
}

function normalizeLink(value: unknown, feedUrl: string): string | null {
  const first = toArray(value)[0] ?? value;
  if (typeof first === "string") return absolutize(first, feedUrl);
  const record = asRecord(first);
  if (!record) return null;

  const href =
    typeof record["@_href"] === "string"
      ? record["@_href"]
      : typeof record.href === "string"
        ? record.href
        : asText(record["#text"]);
  return href ? absolutize(href, feedUrl) : null;
}

function absolutize(value: string, feedUrl: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed, feedUrl).toString();
  } catch {
    return trimmed;
  }
}

function parseDate(value: unknown): number | null {
  const raw = asText(value);
  if (!raw) return null;
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

function asText(value: unknown): string {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  const record = asRecord(value);
  if (!record) return "";
  return asText(record["#text"]);
}

function asRecord(value: unknown): XmlRecord | null {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is XmlRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

function stringOption(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberOption(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
