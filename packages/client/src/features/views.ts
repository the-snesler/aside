import type { MessageDoc } from "@aside/shared";
import { useEffect, useState } from "react";
import type { AttachmentCollection, MessageCollection } from "../db/database";
import { HOME_ID } from "./channels/home";

/**
 * The note feed can be scoped by either a *smart filter* (computed from the
 * notes — all / today / has-a-link / has-a-photo) or a *channel* (by its id). A
 * single `view: string` carries the selection: the smart-filter sentinels below
 * or a real channel id. `ALL_ID` reuses the existing Home sentinel so nothing
 * else has to change.
 */
export const ALL_ID = HOME_ID;
export const TODAY_ID = "__today__";
export const LINKS_ID = "__links__";
export const PHOTOS_ID = "__photos__";
export const SETTINGS_ID = "__settings__";

const SMART_VIEW_IDS = new Set<string>([ALL_ID, TODAY_ID, LINKS_ID, PHOTOS_ID]);

/** True if `view` is a smart filter rather than a channel id. */
export function isSmartView(view: string): boolean {
  return SMART_VIEW_IDS.has(view);
}

/** Whether a timestamp falls on the local calendar day. */
export function isToday(ts: number): boolean {
  const d = new Date(ts);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Deterministic, independent of embed-fetch timing — so the count and the filter
// always agree even before the server attaches a preview.
const URL_RE = /https?:\/\//i;

/** Whether a note's text contains a URL. */
export function hasLink(text: string): boolean {
  return URL_RE.test(text);
}

/**
 * Whether a note belongs in the given view. `imageMessageIds` is the set of
 * message ids that have at least one image attachment (the Photos filter).
 */
export function matchesView(
  view: string,
  doc: MessageDoc,
  imageMessageIds: Set<string>,
): boolean {
  switch (view) {
    case ALL_ID:
      return true;
    case TODAY_ID:
      return isToday(doc.createdAt);
    case LINKS_ID:
      return hasLink(doc.text);
    case PHOTOS_ID:
      return imageMessageIds.has(doc.id);
    default:
      return doc.channelId === view;
  }
}

export interface NoteCounts {
  all: number;
  today: number;
  links: number;
  photos: number;
  /** channelId → note count */
  byChannel: Map<string, number>;
}

const EMPTY_COUNTS: NoteCounts = {
  all: 0,
  today: 0,
  links: 0,
  photos: 0,
  byChannel: new Map(),
};

/**
 * Live note counts for the nav badges. Subscribes once to messages (+ image
 * attachments for the Photos count) and recomputes on either change. Shared by
 * the sidebar nav and the mobile filter tabs.
 */
export function useNoteCounts(
  messages: MessageCollection,
  attachments: AttachmentCollection,
): NoteCounts {
  const [counts, setCounts] = useState<NoteCounts>(EMPTY_COUNTS);

  useEffect(() => {
    let msgs: MessageDoc[] = [];
    let imageMessageIds = new Set<string>();

    const recompute = () => setCounts(computeCounts(msgs, imageMessageIds));

    const msgSub = messages.find().$.subscribe((found) => {
      msgs = found;
      recompute();
    });
    const attSub = attachments.find().$.subscribe((found) => {
      imageMessageIds = new Set(
        found
          .filter((a) => a.mimeType.startsWith("image/"))
          .map((a) => a.messageId),
      );
      recompute();
    });

    return () => {
      msgSub.unsubscribe();
      attSub.unsubscribe();
    };
  }, [messages, attachments]);

  return counts;
}

function computeCounts(
  msgs: MessageDoc[],
  imageMessageIds: Set<string>,
): NoteCounts {
  const byChannel = new Map<string, number>();
  let today = 0;
  let links = 0;
  let photos = 0;
  for (const m of msgs) {
    if (isToday(m.createdAt)) today += 1;
    if (hasLink(m.text)) links += 1;
    if (imageMessageIds.has(m.id)) photos += 1;
    byChannel.set(m.channelId, (byChannel.get(m.channelId) ?? 0) + 1);
  }
  return { all: msgs.length, today, links, photos, byChannel };
}
