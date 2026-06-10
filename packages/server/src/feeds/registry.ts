import { twitterBookmarksSource } from "./sources/twitter.js";
import type { FeedSource } from "./types.js";

/**
 * Registry of available feed sources, keyed by `type`. Add a source here (and a
 * file under sources/) to make a new feed kind selectable. Twitter bookmarks is
 * the only source today.
 */
const sources = new Map<string, FeedSource>(
  [twitterBookmarksSource].map((source) => [source.type, source]),
);

export function getSource(type: string): FeedSource | undefined {
  return sources.get(type);
}

export function listSourceTypes(): string[] {
  return [...sources.keys()];
}
