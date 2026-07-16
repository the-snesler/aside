import {
  DEFAULT_CHANNEL_ID,
  parseReminder,
  type AttachmentDoc,
  type ChannelDoc,
  type EmbedDoc,
  type MessageDoc,
} from "@aside/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageScroller, useMessageScroller } from "@shadcn/react/message-scroller";
import type { RxDocument } from "rxdb";
import IconCopy from "~icons/lucide/copy";
import IconPencil from "~icons/lucide/pencil";
import IconPin from "~icons/lucide/pin";
import IconPinOff from "~icons/lucide/pin-off";
import IconTags from "~icons/lucide/tags";
import IconTrash from "~icons/lucide/trash-2";
import type {
  AttachmentCollection,
  ChannelCollection,
  EmbedCollection,
  MessageCollection,
} from "../../db/database";
import { uploadBlob } from "../attachments/api";
import { parseChannelTag, stripChannelTag } from "../channels/channelName";
import {
  channelType,
  pinnedMessageIds,
  sortChannels,
} from "../channels/channelMeta";
import {
  addMessageChannel,
  messageChannelIds,
  removeMessageChannel,
} from "../channels/membership";
import {
  isSmartView,
  matchesView,
  PHOTOS_ID,
  REMINDERS_ID,
  TASKS_ID,
  type NoteCounts,
} from "../views";
import type { MarkdownEditorHandle } from "./MarkdownEditor";
import { MessageActionSheet } from "./MessageActionSheet";
import { MessageComposer } from "./MessageComposer";
import { headerMeta, MessageListHeader } from "./MessageListHeader";
import { MessageRow } from "./MessageRow";
import {
  fetchPage,
  liveSelector,
  mergeDocs,
  rowsByDay,
  type TimelineRow,
} from "./timeline";
import type { PendingAttachment } from "./types";

interface Props {
  messages: MessageCollection;
  channels: ChannelCollection;
  embeds: EmbedCollection;
  attachments: AttachmentCollection;
  view: string;
  counts: NoteCounts;
  onOpenMenu: () => void;
  onOpenSettings: () => void;
  onOpenSearch: () => void;
  focusedMessageId: string | null;
}

// Stable empty set so non-Photos views pass an identity-stable filter (see
// `photoFilterIds`) and don't recreate the loaders on every attachment change.
const EMPTY_IMAGE_IDS: Set<string> = new Set();

// A one-shot request to bring a row into view: after a send (jump to the new
// note) or a pinned-message jump (center it and flash a highlight).
type ScrollTarget = {
  id: string;
  align: "center" | "end";
  highlight: boolean;
};

function ScrollController({
  scrollTarget,
  rows,
  onHandled,
  onHighlight,
}: {
  scrollTarget: ScrollTarget | null;
  rows: TimelineRow[];
  onHandled: () => void;
  onHighlight: (id: string) => void;
}) {
  const { scrollToMessage } = useMessageScroller();
  useEffect(() => {
    if (!scrollTarget) return;
    const present = rows.some(
      (row) => row.type === "message" && row.doc.id === scrollTarget.id,
    );
    if (!present) return;
    scrollToMessage(scrollTarget.id, {
      align: scrollTarget.align,
      behavior: "smooth",
    });
    if (scrollTarget.highlight) onHighlight(scrollTarget.id);
    onHandled();
  }, [rows, scrollTarget, scrollToMessage, onHandled, onHighlight]);
  return null;
}

export function MessageList({
  messages,
  channels,
  embeds,
  attachments,
  view,
  counts,
  onOpenMenu,
  onOpenSettings,
  onOpenSearch,
  focusedMessageId,
}: Props) {
  const smartView = isSmartView(view);
  const [docs, setDocs] = useState<RxDocument<MessageDoc>[]>([]);
  const [channelDocs, setChannelDocs] = useState<RxDocument<ChannelDoc>[]>([]);
  const [channelNames, setChannelNames] = useState<Map<string, string>>(
    new Map(),
  );
  // OG-2: server-attached link previews, grouped by the message they belong to.
  const [embedsByMessage, setEmbedsByMessage] = useState<
    Map<string, EmbedDoc[]>
  >(new Map());
  // messageId → its attachments, for the cards rendered below each note.
  const [attachmentsByMessage, setAttachmentsByMessage] = useState<
    Map<string, RxDocument<AttachmentDoc>[]>
  >(new Map());
  // Files staged for the next send.
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  // Bumped after each successful send to remount (and so clear + refocus) the
  // composer editor, which owns its own draft.
  const [composerKey, setComposerKey] = useState(0);
  // EDIT-1: which row is open for editing.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [channelPickerId, setChannelPickerId] = useState<string | null>(null);
  const [pinnedDocs, setPinnedDocs] = useState<RxDocument<MessageDoc>[]>([]);
  // Message targeted by a mobile long-press; drives the bottom action sheet.
  const [actionSheetId, setActionSheetId] = useState<string | null>(null);

  const composerRef = useRef<MarkdownEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const oldestCursorRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const loadingOlderRef = useRef(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [liveAfter, setLiveAfter] = useState<number | null>(null);
  // True when the initial load found an empty *collection* — i.e. a fresh client
  // whose first replication pull hasn't landed yet. Such a load anchors the live
  // tail at "now", so notes that sync in afterward (all with past createdAts)
  // would match neither the empty snapshot nor the live tail. We re-run the load
  // once the first document arrives. See the recovery effect below.
  const [awaitingFirstData, setAwaitingFirstData] = useState(false);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // One-shot scroll request, drained by ScrollController once the row exists.
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(null);
  // The scroller mounts only once the first page has resolved, so it opens
  // at the newest note instead of an empty viewport.
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  useEffect(() => {
    // id → name map for the header and smart-view per-note badges.
    const sub = channels.find().$.subscribe((found) => {
      setChannelDocs(sortChannels([...found]));
      setChannelNames(new Map(found.map((c) => [c.id, c.name])));
    });
    return () => sub.unsubscribe();
  }, [channels]);

  useEffect(() => {
    // messageId → its previews. find() already excludes soft-deleted embeds, so
    // a preview whose URL was edited out simply disappears. Sorted by creation so
    // multiple cards keep a stable order.
    const sub = embeds.find().$.subscribe((found) => {
      const map = new Map<string, EmbedDoc[]>();
      for (const e of [...found].sort((a, b) => a.createdAt - b.createdAt)) {
        const list = map.get(e.messageId);
        if (list) list.push(e);
        else map.set(e.messageId, [e]);
      }
      setEmbedsByMessage(map);
    });
    return () => sub.unsubscribe();
  }, [embeds]);

  useEffect(() => {
    // Group every attachment by its message so each row can render its cards.
    const sub = attachments.find().$.subscribe((found) => {
      const map = new Map<string, RxDocument<AttachmentDoc>[]>();
      for (const a of found) {
        const list = map.get(a.messageId);
        if (list) list.push(a);
        else map.set(a.messageId, [a]);
      }
      setAttachmentsByMessage(map);
    });
    return () => sub.unsubscribe();
  }, [attachments]);

  // The Photos filter needs to know which notes carry an image attachment.
  const imageMessageIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [messageId, list] of attachmentsByMessage) {
      if (list.some((a) => a.mimeType.startsWith("image/"))) ids.add(messageId);
    }
    return ids;
  }, [attachmentsByMessage]);

  // `matchesView` only consults this for the Photos view; every other view
  // ignores it. Gating it on the view keeps an unrelated attachment write (your
  // own, or one synced in) from churning `imageMessageIds`' identity and so
  // recreating the loaders below — which would reset and reload the timeline,
  // momentarily wiping a just-sent note. The stable empty set means non-Photos
  // views never reload on attachment changes.
  const photoFilterIds = view === PHOTOS_ID ? imageMessageIds : EMPTY_IMAGE_IDS;

  const loadInitial = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    oldestCursorRef.current = null;
    setDocs([]);
    setHasMore(true);
    setLiveAfter(null);
    // Unmount the scroller so the next mount opens at the bottom of the
    // freshly loaded view rather than restoring a stale scroll position.
    setInitialLoadDone(false);

    const page = await fetchPage(messages, view, photoFilterIds, null);
    if (requestId !== requestIdRef.current) return;
    oldestCursorRef.current = page.nextCursor;
    setDocs(page.docs);
    setHasMore(page.hasMore);
    setLiveAfter(page.docs.at(-1)?.createdAt ?? Date.now());
    setInitialLoadDone(true);

    // An empty page on a populated collection just means this view has no notes;
    // an empty page on an *empty* collection means we're a fresh client still
    // waiting on the first sync. Only the latter needs the reload-on-arrival
    // recovery, so it never fires for a genuinely empty channel or interferes
    // with sending the first note on an already-synced client.
    if (page.docs.length > 0) {
      setAwaitingFirstData(false);
    } else {
      const existing = await messages.findOne().exec();
      if (requestId !== requestIdRef.current) return;
      setAwaitingFirstData(!existing);
    }
  }, [photoFilterIds, messages, view]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  // Recovery for the fresh-client case: while the collection is still empty,
  // watch for the first synced document and re-run the initial load so the
  // streamed-in history (and any note pushed from another device) actually
  // renders without a manual re-navigation. loadInitial clears the flag once it
  // sees data, unsubscribing us; a genuinely empty view never trips this because
  // findOne() above leaves awaitingFirstData false when other notes exist.
  useEffect(() => {
    if (!awaitingFirstData) return;
    const sub = messages.find().$.subscribe((found) => {
      if (found.length > 0) void loadInitial();
    });
    return () => sub.unsubscribe();
  }, [awaitingFirstData, messages, loadInitial]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMore) return;
    const cursor = oldestCursorRef.current;
    if (cursor === null) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await fetchPage(messages, view, photoFilterIds, cursor);
      oldestCursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
      // Scroll position on prepend is preserved by the scroller's
      // preserveScrollOnPrepend, keyed on each row's stable messageId.
      setDocs((current) => mergeDocs(page.docs, current, view));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMore, photoFilterIds, messages, view]);

  useEffect(() => {
    if (liveAfter === null) return;
    const sub = messages
      .find({
        selector: liveSelector(view, liveAfter),
        sort: [{ createdAt: "asc" }],
      })
      .$.subscribe((found) => {
        const next = found.filter((doc) =>
          matchesView(view, doc, photoFilterIds),
        );
        if (next.length === 0) return;
        setDocs((prev) => mergeDocs(prev, next, view));
      });
    return () => sub.unsubscribe();
  }, [photoFilterIds, liveAfter, messages, view]);

  useEffect(() => {
    if (view !== REMINDERS_ID) return;
    const clock = window.setInterval(() => {
      setDocs((prev) =>
        prev.filter((doc) => matchesView(view, doc, photoFilterIds)),
      );
    }, 60_000);
    return () => window.clearInterval(clock);
  }, [photoFilterIds, view]);

  const rows = useMemo(() => rowsByDay(docs, view), [docs, view]);

  // Prefetch older history once the viewport scrolls near its top. Reads the
  // real scrollTop off the native scroll event's target instead of a ref —
  // MessageScroller.Viewport's `ref` prop only composes under React 19 (this
  // app is on React 18), so a ref-based IntersectionObserver never fires. The
  // scroller's own internals (auto-scroll, prepend preservation, the jump
  // button) use their own internal callback refs and are unaffected.
  // loadOlder itself guards against overlap/no-more-pages/no-cursor, so no
  // extra debounce is needed here.
  const handleViewportScroll = useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (event.currentTarget.scrollTop < 600) void loadOlder();
    },
    [loadOlder],
  );

  // A single timer owns clearing the highlight pulse. Keeping it separate from
  // the effects that *start* the pulse avoids the trap where re-running an
  // effect to clear its trigger also fires its cleanup, cancelling the timeout
  // before the highlight is ever seen.
  useEffect(() => {
    if (!highlightedId) return;
    const handle = window.setTimeout(() => setHighlightedId(null), 1500);
    return () => window.clearTimeout(handle);
  }, [highlightedId]);

  const meta = headerMeta(view, channelNames, counts);
  const currentChannel = smartView
    ? null
    : (channelDocs.find((channel) => channel.id === view) ?? null);
  const currentPinnedMessageIds = useMemo(
    () => (currentChannel ? pinnedMessageIds(currentChannel) : []),
    [currentChannel?.pinnedMessageIds],
  );
  const currentPinnedSet = useMemo(
    () => new Set(currentPinnedMessageIds),
    [currentPinnedMessageIds],
  );
  const composerInitialValue =
    currentChannel && channelType(currentChannel) === "todo" ? "- [ ] " : "";
  const emptyState = useMemo(() => {
    if (view === TASKS_ID) {
      return {
        title: "No open tasks.",
        hint: "Create one with an unchecked Markdown checkbox, like so: - [ ] Follow up",
      };
    }
    if (view === REMINDERS_ID) {
      return {
        title: "No upcoming reminders.",
        hint: "Type a date in a note, or use the time menu on any note to add one.",
      };
    }
    if (currentChannel && channelType(currentChannel) === "todo") {
      return {
        title: "No tasks in this channel yet.",
        hint: "Start with the prefilled checkbox and write the next thing to do.",
      };
    }
    return {
      title: smartView ? "No notes here yet." : "No notes in this channel yet.",
    };
  }, [currentChannel, smartView, view]);

  useEffect(() => {
    if (currentPinnedMessageIds.length === 0) {
      setPinnedDocs([]);
      return;
    }
    let cancelled = false;
    void messages
      .find({
        selector: {
          id: { $in: currentPinnedMessageIds },
        },
      })
      .exec()
      .then((found) => {
        if (cancelled) return;
        const byId = new Map(found.map((doc) => [doc.id, doc]));
        setPinnedDocs(
          currentPinnedMessageIds
            .map((id) => byId.get(id))
            .filter((doc): doc is RxDocument<MessageDoc> => !!doc),
        );
      });
    return () => {
      cancelled = true;
    };
  }, [currentPinnedMessageIds, messages]);

  // A note targeted from elsewhere (e.g. a search result) routes through the
  // same scroll + highlight path. Firing only on the prop (not on `rows`) means
  // it requests the jump once; the scroll effect above retries against `rows`
  // until the row loads, then clears it — so an unrelated later list change
  // can't yank the viewport back to a stale target.
  useEffect(() => {
    if (focusedMessageId) {
      setScrollTarget({
        id: focusedMessageId,
        align: "center",
        highlight: true,
      });
    }
  }, [focusedMessageId]);

  function addFiles(files: File[]) {
    // ATT-3: stage each file with an instant local thumbnail, then upload its
    // bytes in the background. The returned hash is what links to the blob.
    for (const file of files) {
      const tempId = crypto.randomUUID();
      setPending((prev) => [
        ...prev,
        {
          tempId,
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          localUrl: URL.createObjectURL(file),
          status: "uploading",
        },
      ]);
      void uploadBlob(file)
        .then(({ hash }) => {
          setPending((prev) =>
            prev.map((item) =>
              item.tempId === tempId ? { ...item, status: "done", hash } : item,
            ),
          );
        })
        .catch(() => {
          setPending((prev) =>
            prev.map((item) =>
              item.tempId === tempId ? { ...item, status: "error" } : item,
            ),
          );
        });
    }
  }

  function removePending(tempId: string) {
    setPending((prev) => {
      const item = prev.find((p) => p.tempId === tempId);
      if (item) URL.revokeObjectURL(item.localUrl);
      return prev.filter((p) => p.tempId !== tempId);
    });
  }

  function clearPending() {
    setPending((prev) => {
      for (const item of prev) URL.revokeObjectURL(item.localUrl);
      return [];
    });
  }

  async function handleSend(raw: string) {
    const trimmed = raw.trim();
    // Only attachments whose upload has finished can be linked; in-flight ones
    // are dropped (uploads are fast; the user can re-send if needed).
    const ready = pending.filter(
      (p): p is PendingAttachment & { hash: string } =>
        p.status === "done" && !!p.hash,
    );
    if (!trimmed && ready.length === 0) return;

    // CH-4: a #tag files the note in an existing channel of that name and is
    // stripped from the saved text. With no match the note stays in the current
    // channel (or #general from a smart view) and the tag is kept as plain text.
    let targetChannelId = smartView ? DEFAULT_CHANNEL_ID : view;
    let body = trimmed;
    if (trimmed) {
      const tag = parseChannelTag(trimmed);
      if (tag) {
        const tagged = await channels
          .findOne({ selector: { name: tag } })
          .exec();
        if (tagged) {
          targetChannelId = tagged.id;
          body = stripChannelTag(trimmed, tag);
        }
      }
    }
    // The message was only a #tag and carries no attachments — nothing to save.
    if (!body && ready.length === 0) return;

    const now = Date.now();
    const reminder = parseReminder(body, new Date(now));
    // Generate the message id up front so the attachment rows can link to it.
    const messageId = crypto.randomUUID();
    const inserted = await messages.insert({
      id: messageId,
      channelIds: [targetChannelId],
      text: body,
      createdAt: now,
      dueAt: reminder?.dueAt ?? 0,
      updatedAt: now,
    });
    for (const item of ready) {
      await attachments.insert({
        id: crypto.randomUUID(),
        messageId,
        blobHash: item.hash,
        fileName: item.fileName,
        mimeType: item.mimeType,
        size: item.size,
        createdAt: now,
        updatedAt: now,
      });
    }
    clearPending();
    if (matchesView(view, inserted, photoFilterIds)) {
      setDocs((prev) => mergeDocs(prev, [inserted], view));
      setScrollTarget({ id: inserted.id, align: "end", highlight: false });
    }
    // Remount the composer to clear it and put the caret back.
    setComposerKey((k) => k + 1);
  }

  async function copyMessage(doc: RxDocument<MessageDoc>) {
    await navigator.clipboard.writeText(doc.text);
  }

  async function deleteMessage(doc: RxDocument<MessageDoc>) {
    const channelIds = messageChannelIds(doc);
    if (!smartView && channelIds.length > 1) {
      const updated = await doc.incrementalPatch({
        channelIds: removeMessageChannel(doc, view),
        updatedAt: Date.now(),
      });
      setDocs((prev) => {
        return matchesView(view, updated, photoFilterIds)
          ? mergeDocs(
              prev.filter((item) => item.id !== updated.id),
              [updated],
              view,
            )
          : prev.filter((item) => item.id !== updated.id);
      });
      return;
    }

    // The message is being fully removed (not just detached from one channel),
    // so soft-delete its attachments too. Otherwise the attachment rows live on
    // forever, pinning their blobs against garbage collection. The find() sub
    // above excludes soft-deleted docs, so the cards drop on the next emit.
    for (const a of attachmentsByMessage.get(doc.id) ?? []) {
      const bumpedAtt = await a.incrementalPatch({ updatedAt: Date.now() });
      await bumpedAtt.remove();
    }

    // Bump updatedAt so the soft-delete wins timestamp-based conflict handling,
    // then remove() the returned (new-revision) doc — not the stale reference.
    const bumped = await doc.incrementalPatch({ updatedAt: Date.now() });
    await bumped.remove();
    setDocs((prev) => prev.filter((item) => item.id !== doc.id));
  }

  function startEdit(doc: RxDocument<MessageDoc>) {
    setEditingId(doc.id);
    setChannelPickerId(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(doc: RxDocument<MessageDoc>, raw: string) {
    // EDIT-1: write text + a fresh updatedAt through the normal replication
    // path; the bumped timestamp makes the edit win LWW conflict resolution.
    // Empty or unchanged is a no-op (delete has its own button).
    const trimmed = raw.trim();
    if (!trimmed || trimmed === doc.text) {
      cancelEdit();
      return;
    }
    const now = Date.now();
    const reminder = parseReminder(trimmed, new Date(now));
    const updated = await doc.incrementalModify((data) => {
      const next: MessageDoc = {
        ...data,
        text: trimmed,
        updatedAt: now,
      };
      if (reminder) next.dueAt = reminder.dueAt;
      else next.dueAt = 0;
      return next;
    });
    setDocs((prev) => {
      return matchesView(view, updated, photoFilterIds)
        ? mergeDocs(
            prev.filter((item) => item.id !== updated.id),
            [updated],
            view,
          )
        : prev.filter((item) => item.id !== updated.id);
    });
    cancelEdit();
  }

  async function saveMetadata(
    doc: RxDocument<MessageDoc>,
    createdAt: number,
    dueAt: number | null,
  ) {
    const updated = await doc.incrementalModify((data) => {
      const next: MessageDoc = { ...data, createdAt, updatedAt: Date.now() };
      next.dueAt = dueAt ?? 0;
      return next;
    });
    setDocs((prev) => {
      return matchesView(view, updated, photoFilterIds)
        ? mergeDocs(
            prev.filter((item) => item.id !== updated.id),
            [updated],
            view,
          )
        : prev.filter((item) => item.id !== updated.id);
    });
  }

  async function toggleTask(doc: RxDocument<MessageDoc>, nextText: string) {
    // Clicking a rendered task checkbox flips its marker in the source. Persist
    // it like an edit: bump updatedAt so the change wins LWW conflict handling.
    if (nextText === doc.text) return;
    const updated = await doc.incrementalPatch({
      text: nextText,
      updatedAt: Date.now(),
    });
    setDocs((prev) => {
      return matchesView(view, updated, photoFilterIds)
        ? mergeDocs(
            prev.filter((item) => item.id !== updated.id),
            [updated],
            view,
          )
        : prev.filter((item) => item.id !== updated.id);
    });
  }

  async function toggleMessageChannel(
    doc: RxDocument<MessageDoc>,
    channelId: string,
  ) {
    const channelIds = messageChannelIds(doc);
    const nextChannelIds = channelIds.includes(channelId)
      ? channelIds.length === 1
        ? channelIds
        : removeMessageChannel(doc, channelId)
      : addMessageChannel(doc, channelId);
    if (nextChannelIds.join("\0") === channelIds.join("\0")) return;

    const updated = await doc.incrementalPatch({
      channelIds: nextChannelIds,
      updatedAt: Date.now(),
    });
    setDocs((prev) => {
      return matchesView(view, updated, photoFilterIds)
        ? mergeDocs(
            prev.filter((item) => item.id !== updated.id),
            [updated],
            view,
          )
        : prev.filter((item) => item.id !== updated.id);
    });
  }

  async function togglePin(doc: RxDocument<MessageDoc>) {
    if (!currentChannel) return;
    const ids = pinnedMessageIds(currentChannel);
    const next = ids.includes(doc.id)
      ? ids.filter((id) => id !== doc.id)
      : [...ids, doc.id];
    await currentChannel.incrementalPatch({
      pinnedMessageIds: next,
      updatedAt: Date.now(),
    });
  }

  function selectPinnedMessage(message: RxDocument<MessageDoc>) {
    setDocs((prev) => {
      if (prev.some((doc) => doc.id === message.id)) return prev;
      return mergeDocs(prev, [message], view);
    });
    setScrollTarget({ id: message.id, align: "center", highlight: true });
  }

  return (
    <main className="relative z-10 flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-chat md:-ml-5 md:rounded-[28px] md:shadow-xl md:ring-1 md:ring-black/5">
      <MessageListHeader
        view={view}
        smartView={smartView}
        channelNames={channelNames}
        description={
          smartView
            ? null
            : (channelDocs.find((c) => c.id === view)?.description ?? null)
        }
        pinnedMessages={pinnedDocs}
        counts={counts}
        onOpenMenu={onOpenMenu}
        onOpenSettings={onOpenSettings}
        onOpenSearch={onOpenSearch}
        onSelectPinnedMessage={selectPinnedMessage}
      />

      <div className="relative min-h-0 flex-1">
        {initialLoadDone && (
          <MessageScroller.Provider
            key={view}
            autoScroll
            defaultScrollPosition="end"
          >
            <MessageScroller.Root className="relative flex h-full flex-col overflow-hidden">
              <MessageScroller.Viewport
                onScroll={handleViewportScroll}
                className="h-full overflow-y-auto overscroll-contain"
              >
                <MessageScroller.Content className="flex min-h-full flex-col pb-3">
                  {loadingOlder && (
                    <p className="px-2 py-2 text-center text-xs text-muted">
                      Loading older notes…
                    </p>
                  )}
                  {!hasMore && rows.length > 0 && (
                    <p className="px-2 py-2 text-center text-xs text-muted">
                      Beginning of history
                    </p>
                  )}
                  {rows.length === 0 ? (
                    <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-10 text-center">
                      <p className="text-sm font-medium text-ink/80">
                        {emptyState.title}
                      </p>
                      {emptyState.hint && (
                        <p className="mt-2 text-sm leading-6 text-muted">
                          {emptyState.hint}
                        </p>
                      )}
                    </div>
                  ) : (
                    rows.map((row) => (
                      <MessageScroller.Item
                        key={row.key}
                        messageId={
                          row.type === "message" ? row.doc.id : undefined
                        }
                      >
                        {row.type === "day" ? (
                          <div className="flex items-center gap-3 pb-1 pt-4 px-4">
                            <span className="text-xs font-semibold text-muted">
                              {row.label}
                            </span>
                            <span className="h-px flex-1 bg-divider" />
                          </div>
                        ) : (
                          <MessageRow
                            doc={row.doc}
                            smartView={smartView}
                            channels={channelDocs}
                            channelNames={channelNames}
                            isEditing={editingId === row.doc.id}
                            channelPickerOpen={channelPickerId === row.doc.id}
                            highlighted={highlightedId === row.doc.id}
                            embeds={embedsByMessage.get(row.doc.id)}
                            attachments={attachmentsByMessage.get(row.doc.id)}
                            pinned={currentPinnedSet.has(row.doc.id)}
                            onStartEdit={startEdit}
                            onCancelEdit={cancelEdit}
                            onSaveEdit={saveEdit}
                            onSaveMetadata={saveMetadata}
                            onToggleTask={toggleTask}
                            onCopy={copyMessage}
                            onDelete={deleteMessage}
                            onTogglePin={togglePin}
                            onToggleChannelPicker={(doc) =>
                              setChannelPickerId((id) =>
                                id === doc.id ? null : doc.id,
                              )
                            }
                            onCloseChannelPicker={() =>
                              setChannelPickerId(null)
                            }
                            onToggleChannel={toggleMessageChannel}
                            onLongPress={(doc) => setActionSheetId(doc.id)}
                          />
                        )}
                      </MessageScroller.Item>
                    ))
                  )}
                </MessageScroller.Content>
              </MessageScroller.Viewport>
              <MessageScroller.Button className="absolute bottom-3 left-1/2 z-20 -translate-x-1/2 rounded-full border border-divider bg-panel px-3 py-1 text-xs font-medium text-ink shadow-lg transition-opacity data-[active=false]:pointer-events-none data-[active=false]:opacity-0">
                Jump to latest
              </MessageScroller.Button>
              <ScrollController
                scrollTarget={scrollTarget}
                rows={rows}
                onHandled={() => setScrollTarget(null)}
                onHighlight={setHighlightedId}
              />
            </MessageScroller.Root>
          </MessageScroller.Provider>
        )}
      </div>

      <MessageComposer
        pending={pending}
        composerKey={`${view}:${composerKey}:${composerInitialValue}`}
        initialValue={composerInitialValue}
        composerRef={composerRef}
        fileInputRef={fileInputRef}
        channels={channelDocs}
        placeholder={smartView ? "Jot a note…" : `Message #${meta.label}`}
        onAddFiles={addFiles}
        onRemovePending={removePending}
        onSend={(text) => void handleSend(text)}
      />

      {actionSheetId &&
        (() => {
          const target = docs.find((d) => d.id === actionSheetId);
          if (!target) return null;
          return (
            <MessageActionSheet
              onClose={() => setActionSheetId(null)}
              actions={[
                ...(currentChannel
                  ? [
                      {
                        label: currentPinnedSet.has(target.id)
                          ? "Unpin"
                          : "Pin",
                        Icon: currentPinnedSet.has(target.id)
                          ? IconPinOff
                          : IconPin,
                        onSelect: () => void togglePin(target),
                      },
                    ]
                  : []),
                {
                  label: "Edit channels",
                  Icon: IconTags,
                  onSelect: () => setChannelPickerId(target.id),
                },
                {
                  label: "Edit",
                  Icon: IconPencil,
                  onSelect: () => startEdit(target),
                },
                {
                  label: "Copy",
                  Icon: IconCopy,
                  onSelect: () => void copyMessage(target),
                },
                {
                  label: "Delete",
                  Icon: IconTrash,
                  danger: true,
                  onSelect: () => void deleteMessage(target),
                },
              ]}
            />
          );
        })()}
    </main>
  );
}
