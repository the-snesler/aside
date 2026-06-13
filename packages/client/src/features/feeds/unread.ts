import type { ConfigDoc, MessageDoc } from "@aside/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ConfigCollection, MessageCollection } from "../../db/database";
import { messageChannelIds } from "../channels/membership";
import type { Feed } from "./api";

const READ_PREFIX = "feed-read:";

export interface FeedUnreadState {
  unreadChannelIds: Set<string>;
  latestByChannel: Map<string, number>;
}

export function useFeedUnread(
  messages: MessageCollection,
  config: ConfigCollection,
  feeds: Feed[],
): FeedUnreadState & { markChannelRead: (channelId: string) => Promise<void> } {
  const [docs, setDocs] = useState<MessageDoc[]>([]);
  const [configDocs, setConfigDocs] = useState<ConfigDoc[]>([]);

  useEffect(() => {
    const sub = messages.find().$.subscribe((found) => setDocs(found));
    return () => sub.unsubscribe();
  }, [messages]);

  useEffect(() => {
    const sub = config.find().$.subscribe((found) => setConfigDocs(found));
    return () => sub.unsubscribe();
  }, [config]);

  const markers = useMemo(() => readMarkers(configDocs), [configDocs]);
  const state = useMemo(
    () => computeFeedUnread(docs, feeds, markers),
    [docs, feeds, markers],
  );

  const markChannelRead = useCallback(
    async (channelId: string) => {
      const lastSeenUpdatedAt = state.latestByChannel.get(channelId);
      if (lastSeenUpdatedAt === undefined) return;
      if (lastSeenUpdatedAt <= (markers.get(channelId) ?? 0)) return;

      const id = readMarkerId(channelId);
      const existing = await config.findOne(id).exec();
      const now = Date.now();
      await config.upsert({
        id,
        value: JSON.stringify({ lastSeenUpdatedAt }),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      });
    },
    [config, markers, state.latestByChannel],
  );

  return { ...state, markChannelRead };
}

export function computeFeedUnread(
  messages: MessageDoc[],
  feeds: Feed[],
  markers: Map<string, number>,
): FeedUnreadState {
  const latestByChannel = new Map<string, number>();

  for (const feed of feeds) {
    const prefix = feedMessagePrefix(feed.type);
    if (!prefix) continue;

    for (const message of messages) {
      if (!message.id.startsWith(prefix)) continue;
      if (!messageChannelIds(message).includes(feed.channelId)) continue;
      const current = latestByChannel.get(feed.channelId) ?? 0;
      if (message.updatedAt > current) {
        latestByChannel.set(feed.channelId, message.updatedAt);
      }
    }
  }

  const unreadChannelIds = new Set<string>();
  for (const [channelId, latest] of latestByChannel) {
    if (latest > (markers.get(channelId) ?? 0)) unreadChannelIds.add(channelId);
  }

  return { unreadChannelIds, latestByChannel };
}

export function readMarkers(configDocs: ConfigDoc[]): Map<string, number> {
  const markers = new Map<string, number>();
  for (const doc of configDocs) {
    if (!doc.id.startsWith(READ_PREFIX)) continue;
    try {
      const parsed = JSON.parse(doc.value) as { lastSeenUpdatedAt?: unknown };
      if (typeof parsed.lastSeenUpdatedAt === "number") {
        markers.set(doc.id.slice(READ_PREFIX.length), parsed.lastSeenUpdatedAt);
      }
    } catch {
      // Ignore malformed synced config values; a future read will overwrite them.
    }
  }
  return markers;
}

export function feedMessagePrefix(type: string): string | null {
  switch (type) {
    case "twitter-bookmarks":
      return "tw:";
    case "rss":
      return "rss:";
    default:
      return null;
  }
}

function readMarkerId(channelId: string): string {
  return `${READ_PREFIX}${channelId}`;
}
