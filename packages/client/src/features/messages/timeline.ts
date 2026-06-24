import type { MessageDoc } from "@aside/shared";
import type { MangoQuerySelector, RxDocument } from "rxdb";
import type { MessageCollection } from "../../db/database";
import {
  ALL_ID,
  LINKS_ID,
  PHOTOS_ID,
  REMINDERS_ID,
  TODAY_ID,
  matchesView,
} from "../views";

const PAGE_SIZE = 50;
const SCAN_SIZE = 160;

export interface PageResult {
  docs: RxDocument<MessageDoc>[];
  nextCursor: number | null;
  hasMore: boolean;
}

export type TimelineRow =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; doc: RxDocument<MessageDoc> };

export function rowsByDay(
  docs: RxDocument<MessageDoc>[],
  view = ALL_ID,
): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let lastKey: string | null = null;
  for (const doc of docs) {
    const date = new Date(rowTimestamp(doc, view));
    const key = date.toDateString();
    if (lastKey !== key) {
      rows.push({
        type: "day",
        key: `day:${key}`,
        label: formatDayLabel(date),
      });
      lastKey = key;
    }
    rows.push({ type: "message", key: doc.id, doc });
  }
  return rows;
}

export async function fetchPage(
  messages: MessageCollection,
  view: string,
  imageMessageIds: Set<string>,
  before: number | null,
): Promise<PageResult> {
  if (view === REMINDERS_ID) {
    return fetchUpcomingReminderPage(messages, before);
  }
  if (view !== ALL_ID && view !== TODAY_ID) {
    return fetchFilteredPage(messages, view, imageMessageIds, before);
  }
  const docs = await queryRecent(
    messages,
    recentSelector(view, before),
    PAGE_SIZE,
  );
  return pageFromBatch(docs);
}

async function fetchUpcomingReminderPage(
  messages: MessageCollection,
  afterDueAt: number | null,
): Promise<PageResult> {
  const dueAt =
    afterDueAt === null
      ? { $gte: Date.now() }
      : { $gt: afterDueAt, $gte: Date.now() };
  const docs = await messages
    .find({
      selector: { dueAt },
      sort: [{ dueAt: "asc" }],
      limit: PAGE_SIZE,
    })
    .exec();
  return {
    docs,
    nextCursor: newestDueAt(docs),
    hasMore: docs.length === PAGE_SIZE,
  };
}

async function fetchFilteredPage(
  messages: MessageCollection,
  view: string,
  imageMessageIds: Set<string>,
  before: number | null,
): Promise<PageResult> {
  let cursor = before;
  let hasMore = true;
  const matches: RxDocument<MessageDoc>[] = [];

  while (matches.length < PAGE_SIZE && hasMore) {
    const batch = await queryRecent(
      messages,
      recentSelector(ALL_ID, cursor),
      SCAN_SIZE,
    );
    hasMore = batch.length === SCAN_SIZE;
    cursor = oldestCreatedAt(batch);
    matches.push(
      ...batch.filter((doc) => matchesView(view, doc, imageMessageIds)),
    );
  }

  return {
    docs: sortAscending(matches, view).slice(-PAGE_SIZE),
    nextCursor: cursor,
    hasMore,
  };
}

async function queryRecent(
  messages: MessageCollection,
  selector: MangoQuerySelector<MessageDoc>,
  limit: number,
): Promise<RxDocument<MessageDoc>[]> {
  const docs = await messages
    .find({
      selector,
      sort: [{ createdAt: "desc" }],
      limit,
    })
    .exec();
  return docs;
}

function recentSelector(
  view: string,
  before: number | null,
): MangoQuerySelector<MessageDoc> {
  const createdAt = before === null ? {} : { $lt: before };
  if (view === TODAY_ID) {
    const { start, end } = todayRange();
    return {
      createdAt: {
        ...createdAt,
        $gte: start,
        $lt: Math.min(end, before ?? end),
      },
    };
  }
  if (view === ALL_ID) {
    return before === null ? {} : { createdAt };
  }
  return before === null ? {} : { createdAt };
}

export function liveSelector(
  view: string,
  after: number,
): MangoQuerySelector<MessageDoc> {
  if (view === TODAY_ID) {
    const { start, end } = todayRange();
    return { createdAt: { $gte: Math.max(start, after), $lt: end } };
  }
  if (view === REMINDERS_ID) {
    return { dueAt: { $gte: Date.now() } };
  }
  if (view === ALL_ID || view === LINKS_ID || view === PHOTOS_ID) {
    return { createdAt: { $gte: after } };
  }
  return { createdAt: { $gte: after } };
}

function pageFromBatch(docs: RxDocument<MessageDoc>[]): PageResult {
  return {
    docs: sortAscending(docs),
    nextCursor: oldestCreatedAt(docs),
    hasMore: docs.length === PAGE_SIZE,
  };
}

export function mergeDocs(
  left: RxDocument<MessageDoc>[],
  right: RxDocument<MessageDoc>[],
  view = ALL_ID,
): RxDocument<MessageDoc>[] {
  const byId = new Map<string, RxDocument<MessageDoc>>();
  for (const doc of left) byId.set(doc.id, doc);
  for (const doc of right) byId.set(doc.id, doc);
  return sortAscending([...byId.values()], view);
}

function sortAscending(
  docs: RxDocument<MessageDoc>[],
  view = ALL_ID,
): RxDocument<MessageDoc>[] {
  return [...docs].sort(
    (a, b) => rowTimestamp(a, view) - rowTimestamp(b, view),
  );
}

function oldestCreatedAt(docs: RxDocument<MessageDoc>[]): number | null {
  if (docs.length === 0) return null;
  return Math.min(...docs.map((doc) => doc.createdAt));
}

function newestDueAt(docs: RxDocument<MessageDoc>[]): number | null {
  if (docs.length === 0) return null;
  return Math.max(...docs.map((doc) => doc.dueAt ?? 0));
}

function rowTimestamp(doc: MessageDoc, view: string): number {
  return view === REMINDERS_ID ? doc.dueAt : doc.createdAt;
}

function todayRange(): { start: number; end: number } {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

function formatDayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
