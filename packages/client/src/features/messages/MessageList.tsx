import {
  DEFAULT_CHANNEL_ID,
  type AttachmentDoc,
  type ChannelDoc,
  type EmbedDoc,
  type MessageDoc,
} from "@aside/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import type { RxDocument } from "rxdb";
import IconCopy from "~icons/lucide/copy";
import IconPencil from "~icons/lucide/pencil";
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
  addMessageChannel,
  messageChannelIds,
  removeMessageChannel,
} from "../channels/membership";
import { isSmartView, matchesView, type NoteCounts } from "../views";
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
import { listComponents, type ListContext } from "./virtuosoComponents";

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

// Virtuoso anchors prepended rows by index: we start at a large constant and
// decrement it by the number of rows added to the front, which keeps the
// viewport pinned to the same note as older history loads in (no scroll jump).
const START_INDEX = 100_000;

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
  // Message targeted by a mobile long-press; drives the bottom action sheet.
  const [actionSheetId, setActionSheetId] = useState<string | null>(null);

  const composerRef = useRef<MarkdownEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const oldestCursorRef = useRef<number | null>(null);
  const requestIdRef = useRef(0);
  const loadingOlderRef = useRef(false);
  // Mirrors `docs` so loadOlder can measure how many rows a page prepends
  // without recreating the callback on every change.
  const docsRef = useRef<RxDocument<MessageDoc>[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [liveAfter, setLiveAfter] = useState<number | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  // Virtuoso is mounted only once the first page has resolved, so its
  // initialTopMostItemIndex sees the real row count and opens at the newest note.
  const [initialLoadDone, setInitialLoadDone] = useState(false);
  const [firstItemIndex, setFirstItemIndex] = useState(START_INDEX);
  const [autoHistoryEnabled, setAutoHistoryEnabled] = useState(false);

  useEffect(() => {
    // id → name map for the header and smart-view per-note badges.
    const sub = channels.find().$.subscribe((found) => {
      setChannelDocs([...found].sort((a, b) => a.createdAt - b.createdAt));
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

  useEffect(() => {
    docsRef.current = docs;
  }, [docs]);

  const loadInitial = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    oldestCursorRef.current = null;
    setDocs([]);
    setHasMore(true);
    setLiveAfter(null);
    // Unmount Virtuoso and reset its prepend anchor so the next mount opens at
    // the bottom of the freshly loaded view rather than restoring a stale offset.
    setInitialLoadDone(false);
    setFirstItemIndex(START_INDEX);

    const page = await fetchPage(messages, view, imageMessageIds, null);
    if (requestId !== requestIdRef.current) return;
    oldestCursorRef.current = page.nextCursor;
    setDocs(page.docs);
    setHasMore(page.hasMore);
    setLiveAfter(page.docs.at(-1)?.createdAt ?? Date.now());
    setInitialLoadDone(true);
  }, [imageMessageIds, messages, view]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMore) return;
    const cursor = oldestCursorRef.current;
    if (cursor === null) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await fetchPage(messages, view, imageMessageIds, cursor);
      oldestCursorRef.current = page.nextCursor;
      setHasMore(page.hasMore);
      // How many rows land at the front (older messages can add day headers).
      // Decrementing firstItemIndex by that count tells Virtuoso the existing
      // rows kept their absolute index, so it holds the scroll position.
      const prev = docsRef.current;
      const prepended =
        rowsByDay(mergeDocs(page.docs, prev)).length - rowsByDay(prev).length;
      if (prepended > 0) setFirstItemIndex((index) => index - prepended);
      setDocs((current) => mergeDocs(page.docs, current));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [hasMore, imageMessageIds, messages, view]);

  useEffect(() => {
    if (liveAfter === null) return;
    const sub = messages
      .find({
        selector: liveSelector(view, liveAfter),
        sort: [{ createdAt: "asc" }],
      })
      .$.subscribe((found) => {
        const next = found.filter((doc) =>
          matchesView(view, doc, imageMessageIds),
        );
        if (next.length === 0) return;
        setDocs((prev) => mergeDocs(prev, next));
      });
    return () => sub.unsubscribe();
  }, [imageMessageIds, liveAfter, messages, view]);

  const rows = useMemo(() => rowsByDay(docs), [docs]);

  useEffect(() => {
    // Briefly ignore startReached after a view switch so Virtuoso's initial
    // measurement (which can momentarily report the top) doesn't trigger a load.
    setAutoHistoryEnabled(false);
    const handle = window.setTimeout(() => setAutoHistoryEnabled(true), 250);
    return () => window.clearTimeout(handle);
  }, [view]);

  const handleStartReached = useCallback(() => {
    if (!autoHistoryEnabled || loadingOlderRef.current || !hasMore) return;
    void loadOlder();
  }, [autoHistoryEnabled, hasMore, loadOlder]);

  const meta = headerMeta(view, channelNames, counts);

  useEffect(() => {
    if (!focusedMessageId) return;
    const index = rows.findIndex(
      (row) => row.type === "message" && row.doc.id === focusedMessageId,
    );
    if (index === -1) return;
    virtuosoRef.current?.scrollToIndex({
      index,
      align: "center",
      behavior: "smooth",
    });
    setHighlightedId(focusedMessageId);
    const handle = window.setTimeout(() => setHighlightedId(null), 1500);
    return () => window.clearTimeout(handle);
  }, [focusedMessageId, rows]);

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
    // space (or #general from a smart view) and the tag is kept as plain text.
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
    // Generate the message id up front so the attachment rows can link to it.
    const messageId = crypto.randomUUID();
    const inserted = await messages.insert({
      id: messageId,
      channelIds: [targetChannelId],
      text: body,
      createdAt: now,
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
    if (matchesView(view, inserted, imageMessageIds)) {
      setDocs((prev) => mergeDocs(prev, [inserted]));
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
        return matchesView(view, updated, imageMessageIds)
          ? mergeDocs(
              prev.filter((item) => item.id !== updated.id),
              [updated],
            )
          : prev.filter((item) => item.id !== updated.id);
      });
      return;
    }

    // Bump updatedAt so the soft-delete wins timestamp-based conflict handling,
    // then remove() the returned (new-revision) doc — not the stale reference.
    const bumped = await doc.incrementalPatch({ updatedAt: Date.now() });
    await bumped.remove();
    setDocs((prev) => prev.filter((item) => item.id !== doc.id));
  }

  function startEdit(doc: RxDocument<MessageDoc>) {
    setEditingId(doc.id);
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
    const updated = await doc.incrementalPatch({
      text: trimmed,
      updatedAt: Date.now(),
    });
    setDocs((prev) => {
      return matchesView(view, updated, imageMessageIds)
        ? mergeDocs(
            prev.filter((item) => item.id !== updated.id),
            [updated],
          )
        : prev.filter((item) => item.id !== updated.id);
    });
    cancelEdit();
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
      return matchesView(view, updated, imageMessageIds)
        ? mergeDocs(
            prev.filter((item) => item.id !== updated.id),
            [updated],
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
      return matchesView(view, updated, imageMessageIds)
        ? mergeDocs(
            prev.filter((item) => item.id !== updated.id),
            [updated],
          )
        : prev.filter((item) => item.id !== updated.id);
    });
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
        counts={counts}
        onOpenMenu={onOpenMenu}
        onOpenSettings={onOpenSettings}
        onOpenSearch={onOpenSearch}
      />

      <div className="relative min-h-0 flex-1">
        {initialLoadDone && (
          <Virtuoso<TimelineRow, ListContext>
            key={view}
            ref={virtuosoRef}
            data={rows}
            context={{
              loadingOlder,
              hasMore,
              hasRows: rows.length > 0,
              smartView,
            }}
            firstItemIndex={firstItemIndex}
            initialTopMostItemIndex={Math.max(0, rows.length - 1)}
            followOutput={(isAtBottom) => (isAtBottom ? "auto" : false)}
            startReached={handleStartReached}
            increaseViewportBy={600}
            computeItemKey={(_index, row) => row.key}
            components={listComponents}
            className="h-full overscroll-contain"
            itemContent={(_index, row) =>
              row.type === "day" ? (
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
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onToggleTask={toggleTask}
                  onCopy={copyMessage}
                  onDelete={deleteMessage}
                  onToggleChannelPicker={(doc) =>
                    setChannelPickerId((id) => (id === doc.id ? null : doc.id))
                  }
                  onToggleChannel={toggleMessageChannel}
                  onLongPress={(doc) => setActionSheetId(doc.id)}
                />
              )
            }
          />
        )}
      </div>

      <MessageComposer
        pending={pending}
        composerKey={composerKey}
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
                {
                  label: "Edit spaces",
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
