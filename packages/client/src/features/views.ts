import type { MessageDoc } from "@aside/shared";
import { useEffect, useState } from "react";
import type { AttachmentCollection, MessageCollection } from "../db/database";
import { messageChannelIds, messageHasChannel } from "./channels/membership";
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
export const TASKS_ID = "__tasks__";
export const REMINDERS_ID = "__reminders__";
export const SETTINGS_ID = "__settings__";

const SMART_VIEW_IDS = new Set<string>([
  ALL_ID,
  TODAY_ID,
  LINKS_ID,
  PHOTOS_ID,
  TASKS_ID,
  REMINDERS_ID,
]);

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

// GFM unchecked task markers, including the common `- [ ]` and `1. [ ]` forms.
const OPEN_TASK_RE = /(^|\n)\s*(?:[-*+]|\d+[.)])\s+\[ \]/;

/** Whether a note has at least one unchecked Markdown task checkbox. */
export function hasOpenTask(text: string): boolean {
  return OPEN_TASK_RE.test(text);
}

/** Whether a note has a reminder due now or in the future. */
export function hasUpcomingReminder(
  doc: MessageDoc,
  now = Date.now(),
): boolean {
  return doc.dueAt > 0 && doc.dueAt >= now;
}

/**
 * Whether a note belongs in the given view. `imageMessageIds` is the set of
 * message ids that have at least one image attachment (the Photos filter).
 */
export function matchesView(
  view: string,
  doc: MessageDoc,
  imageMessageIds: Set<string>,
  now = Date.now(),
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
    case TASKS_ID:
      return hasOpenTask(doc.text);
    case REMINDERS_ID:
      return hasUpcomingReminder(doc, now);
    default:
      return messageHasChannel(doc, view);
  }
}

export interface NoteCounts {
  all: number;
  today: number;
  links: number;
  photos: number;
  tasks: number;
  reminders: number;
  /** channelId → note count */
  byChannel: Map<string, number>;
}

const EMPTY_COUNTS: NoteCounts = {
  all: 0,
  today: 0,
  links: 0,
  photos: 0,
  tasks: 0,
  reminders: 0,
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
    const clock = window.setInterval(recompute, 60_000);

    return () => {
      msgSub.unsubscribe();
      attSub.unsubscribe();
      window.clearInterval(clock);
    };
  }, [messages, attachments]);

  return counts;
}

export function computeCounts(
  msgs: MessageDoc[],
  imageMessageIds: Set<string>,
): NoteCounts {
  const byChannel = new Map<string, number>();
  let today = 0;
  let links = 0;
  let photos = 0;
  let tasks = 0;
  let reminders = 0;
  const now = Date.now();
  for (const m of msgs) {
    if (isToday(m.createdAt)) today += 1;
    if (hasLink(m.text)) links += 1;
    if (imageMessageIds.has(m.id)) photos += 1;
    if (hasOpenTask(m.text)) tasks += 1;
    if (hasUpcomingReminder(m, now)) reminders += 1;
    for (const channelId of messageChannelIds(m)) {
      byChannel.set(channelId, (byChannel.get(channelId) ?? 0) + 1);
    }
  }
  return {
    all: msgs.length,
    today,
    links,
    photos,
    tasks,
    reminders,
    byChannel,
  };
}
