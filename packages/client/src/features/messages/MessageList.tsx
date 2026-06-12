import {
  DEFAULT_CHANNEL_ID,
  type AttachmentDoc,
  type EmbedDoc,
  type MessageDoc,
} from "@aside/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Virtuoso,
  type Components,
  type VirtuosoHandle,
} from "react-virtuoso";
import type { RxDocument } from "rxdb";
import IconArrowUp from "~icons/lucide/arrow-up";
import IconCopy from "~icons/lucide/copy";
import IconHash from "~icons/lucide/hash";
import IconImage from "~icons/lucide/image";
import IconLink from "~icons/lucide/link";
import IconList from "~icons/lucide/list";
import IconMenu from "~icons/lucide/menu";
import IconPaperclip from "~icons/lucide/paperclip";
import IconPencil from "~icons/lucide/pencil";
import IconSearch from "~icons/lucide/search";
import IconSettings from "~icons/lucide/settings";
import IconSparkles from "~icons/lucide/sparkles";
import IconTrash from "~icons/lucide/trash-2";
import IconX from "~icons/lucide/x";
import type {
  AttachmentCollection,
  ChannelCollection,
  EmbedCollection,
  MessageCollection,
} from "../../db/database";
import { parseChannelTag, stripChannelTag } from "../channels/channelName";
import {
  ALL_ID,
  LINKS_ID,
  PHOTOS_ID,
  TODAY_ID,
  isSmartView,
  matchesView,
  type NoteCounts,
} from "../views";
import { blobUrl, uploadBlob } from "../attachments/api";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { Markdown } from "./Markdown";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";

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

/** A file being uploaded for the next send (ATT-3). */
interface PendingAttachment {
  tempId: string;
  fileName: string;
  mimeType: string;
  size: number;
  /** object URL for an instant local thumbnail */
  localUrl: string;
  status: "uploading" | "done" | "error";
  /** content hash, set once the upload resolves */
  hash?: string;
}

const PAGE_SIZE = 50;
const SCAN_SIZE = 160;
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
      channelId: targetChannelId,
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

  return (
    <main className="relative z-10 flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-chat md:-ml-5 md:rounded-[28px] md:shadow-xl md:ring-1 md:ring-black/5">
      {/* Desktop header: current view + count. */}
      <header className="hidden h-14 shrink-0 items-center gap-2.5 px-6 md:flex">
        <meta.Icon className="h-5 w-5 text-accent" />
        <h1 className="text-lg font-semibold text-ink">
          {smartView ? meta.label : `#${meta.label}`}
        </h1>
        <span className="text-sm tabular-nums text-muted">{meta.count}</span>
      </header>

      {/* Mobile header: title row. Navigation lives in the swipe-revealed sidebar. */}
      <div className="shrink-0 px-4 pt-4 md:hidden">
        <div className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-label="Open sidebar"
            className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink"
          >
            <IconMenu className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-lg font-semibold text-ink">
            {smartView ? meta.label : `#${meta.label}`}
          </h1>
          <button
            type="button"
            onClick={onOpenSearch}
            aria-label="Search"
            className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink"
          >
            <IconSearch className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink"
          >
            <IconSettings className="h-5 w-5" />
          </button>
        </div>
      </div>

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
            itemContent={(_index, row) =>
              row.type === "day" ? (
                <div className="flex items-center gap-3 pb-1 pt-4">
                  <span className="text-xs font-semibold text-muted">
                    {row.label}
                  </span>
                  <span className="h-px flex-1 bg-divider" />
                </div>
              ) : (
                <MessageRow
                  doc={row.doc}
                  smartView={smartView}
                  channelName={channelNames.get(row.doc.channelId)}
                  isEditing={editingId === row.doc.id}
                  highlighted={highlightedId === row.doc.id}
                  embeds={embedsByMessage.get(row.doc.id)}
                  attachments={attachmentsByMessage.get(row.doc.id)}
                  onStartEdit={startEdit}
                  onCancelEdit={cancelEdit}
                  onSaveEdit={saveEdit}
                  onCopy={copyMessage}
                  onDelete={deleteMessage}
                />
              )
            }
            className="px-4 md:px-6"
            style={{ height: "100%" }}
          />
        )}
      </div>

      <div className="shrink-0 px-4 pb-4 pt-1 md:px-6">
        {pending.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((item) => (
              <div key={item.tempId} className="relative h-16 w-16">
                {item.mimeType.startsWith("image/") ? (
                  <img
                    src={item.localUrl}
                    alt={item.fileName}
                    className="h-16 w-16 rounded-lg border border-divider object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-divider bg-rail text-muted">
                    <IconPaperclip className="h-5 w-5" />
                  </div>
                )}
                {item.status !== "done" && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 text-xs text-white">
                    {item.status === "uploading" ? "…" : "!"}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removePending(item.tempId)}
                  aria-label="Remove attachment"
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-panel p-0.5 text-muted shadow ring-1 ring-divider hover:text-ink"
                >
                  <IconX className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2 rounded-2xl bg-panel px-2.5 py-2 shadow-lg ring-1 ring-divider">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length) addFiles(files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach files"
            className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <IconImage className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 self-center">
            <MarkdownEditor
              key={composerKey}
              ref={composerRef}
              initialValue=""
              autoFocus
              placeholder={smartView ? "Jot a note…" : `Message #${meta.label}`}
              onSubmit={(t) => void handleSend(t)}
              onAddFiles={addFiles}
              className="max-h-[40vh] w-full overflow-y-auto bg-transparent py-1.5 text-ink outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => composerRef.current?.submit()}
            aria-label="Send note"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent text-white shadow-md transition-opacity hover:opacity-90"
          >
            <IconArrowUp className="h-5 w-5" />
          </button>
        </div>
      </div>
    </main>
  );
}

/** Values Virtuoso threads into its Header/Footer/EmptyPlaceholder slots. */
interface ListContext {
  loadingOlder: boolean;
  hasMore: boolean;
  hasRows: boolean;
  smartView: boolean;
}

/** Top-of-list status: the older-page spinner, then the start-of-history mark. */
function ListHeader({ context }: { context?: ListContext }) {
  return (
    <div className="pt-3">
      {context?.loadingOlder && (
        <p className="px-2 py-2 text-center text-xs text-muted">
          Loading older notes…
        </p>
      )}
      {context && !context.hasMore && context.hasRows && (
        <p className="px-2 py-2 text-center text-xs text-muted">
          Beginning of history
        </p>
      )}
    </div>
  );
}

/** Breathing room below the newest note so it clears the composer. */
function ListFooter() {
  return <div className="h-3" />;
}

function ListEmpty({ context }: { context?: ListContext }) {
  return (
    <p className="px-2 py-8 text-center text-sm text-muted">
      {context?.smartView ? "No notes here yet." : "No notes in this space yet."}
    </p>
  );
}

const listComponents: Components<TimelineRow, ListContext> = {
  Header: ListHeader,
  Footer: ListFooter,
  EmptyPlaceholder: ListEmpty,
};

function MessageRow({
  doc,
  smartView,
  channelName,
  isEditing,
  highlighted,
  embeds,
  attachments,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onCopy,
  onDelete,
}: {
  doc: RxDocument<MessageDoc>;
  smartView: boolean;
  channelName?: string;
  isEditing: boolean;
  highlighted?: boolean;
  embeds?: EmbedDoc[];
  attachments?: RxDocument<AttachmentDoc>[];
  onStartEdit: (doc: RxDocument<MessageDoc>) => void;
  onCancelEdit: () => void;
  onSaveEdit: (doc: RxDocument<MessageDoc>, raw: string) => Promise<void>;
  onCopy: (doc: RxDocument<MessageDoc>) => Promise<void>;
  onDelete: (doc: RxDocument<MessageDoc>) => Promise<void>;
}) {
  return (
    <div
      className={`group relative flex gap-3 rounded-xl px-2 py-2 transition-all hover:bg-hover md:px-3 ${highlighted ? "bg-active ring-2 ring-accent/60" : ""
        }`}
    >
      <span className="w-11 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted">
        {formatTime(doc.createdAt)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {smartView && (
          <span className="w-fit rounded-md bg-hover px-2 py-0.5 text-[11px] font-medium text-muted">
            <span className="opacity-60">#</span> {channelName ?? "unknown"}
          </span>
        )}
        {isEditing ? (
          <div className="min-w-0 flex-1">
            <MarkdownEditor
              key={doc.id}
              initialValue={doc.text}
              autoFocus
              onSubmit={(text) => void onSaveEdit(doc, text)}
              onCancel={onCancelEdit}
              className="max-h-[50vh] w-full overflow-y-auto rounded-xl bg-panel px-3 py-2 text-ink outline-none ring-1 ring-accent"
            />
            <div className="mt-1 text-xs text-muted">
              escape to{" "}
              <button
                type="button"
                onClick={onCancelEdit}
                className="text-accent hover:underline"
              >
                cancel
              </button>{" "}
              • enter to save • shift+enter for newline
            </div>
          </div>
        ) : (
          <>
            {doc.text && (
              <Markdown text={doc.text} className="break-words text-ink" />
            )}
            {embeds?.map((embed) => (
              <LinkPreviewCard key={embed.id} embed={embed} />
            ))}
            <AttachmentCards items={attachments} />
          </>
        )}
      </div>
      {!isEditing && (
        <span className="absolute right-2 top-0 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg bg-panel px-1 py-0.5 shadow-md ring-1 ring-divider group-hover:flex">
          <button
            type="button"
            onClick={() => onStartEdit(doc)}
            aria-label="Edit"
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink"
          >
            <IconPencil className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void onCopy(doc)}
            aria-label="Copy"
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink"
          >
            <IconCopy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => void onDelete(doc)}
            aria-label="Delete"
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-danger"
          >
            <IconTrash className="h-4 w-4" />
          </button>
        </span>
      )}
    </div>
  );
}

/** Header title, icon, and count for the current view. */
function headerMeta(
  view: string,
  channelNames: Map<string, string>,
  counts: NoteCounts,
): { label: string; Icon: typeof IconList; count: number } {
  switch (view) {
    case ALL_ID:
      return { label: "All Notes", Icon: IconList, count: counts.all };
    case TODAY_ID:
      return { label: "Today", Icon: IconSparkles, count: counts.today };
    case LINKS_ID:
      return { label: "Links", Icon: IconLink, count: counts.links };
    case PHOTOS_ID:
      return { label: "Photos", Icon: IconImage, count: counts.photos };
    default:
      return {
        label: channelNames.get(view) ?? view,
        Icon: IconHash,
        count: counts.byChannel.get(view) ?? 0,
      };
  }
}

/**
 * Renders a message's attachments below its body (ATT-3): images as inline
 * preview cards (linking to the full blob), other files as a download chip.
 */
function AttachmentCards({ items }: { items?: RxDocument<AttachmentDoc>[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {items.map((a) =>
        a.mimeType.startsWith("image/") ? (
          <a
            key={a.id}
            href={blobUrl(a.blobHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={blobUrl(a.blobHash)}
              alt={a.fileName}
              loading="lazy"
              className="max-h-80 max-w-xs rounded-xl border border-divider object-cover"
            />
          </a>
        ) : (
          <a
            key={a.id}
            href={blobUrl(a.blobHash)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl border border-divider bg-panel px-3 py-2 text-sm text-ink hover:bg-hover"
          >
            <IconPaperclip className="h-4 w-4 shrink-0 text-muted" />
            <span className="max-w-[12rem] truncate">{a.fileName}</span>
            <span className="shrink-0 text-xs text-muted">
              {formatSize(a.size)}
            </span>
          </a>
        ),
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PageResult {
  docs: RxDocument<MessageDoc>[];
  nextCursor: number | null;
  hasMore: boolean;
}

type TimelineRow =
  | { type: "day"; key: string; label: string }
  | { type: "message"; key: string; doc: RxDocument<MessageDoc> };

function rowsByDay(docs: RxDocument<MessageDoc>[]): TimelineRow[] {
  const rows: TimelineRow[] = [];
  let lastKey: string | null = null;
  for (const doc of docs) {
    const date = new Date(doc.createdAt);
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

async function fetchPage(
  messages: MessageCollection,
  view: string,
  imageMessageIds: Set<string>,
  before: number | null,
): Promise<PageResult> {
  if (view === LINKS_ID || view === PHOTOS_ID) {
    return fetchFilteredPage(messages, view, imageMessageIds, before);
  }
  const docs = await queryRecent(
    messages,
    recentSelector(view, before),
    PAGE_SIZE,
  );
  return pageFromBatch(docs);
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
    docs: sortAscending(matches).slice(-PAGE_SIZE),
    nextCursor: cursor,
    hasMore,
  };
}

async function queryRecent(
  messages: MessageCollection,
  selector: Record<string, unknown>,
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
): Record<string, unknown> {
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
  return before === null ? { channelId: view } : { channelId: view, createdAt };
}

function liveSelector(view: string, after: number): Record<string, unknown> {
  if (view === TODAY_ID) {
    const { start, end } = todayRange();
    return { createdAt: { $gte: Math.max(start, after), $lt: end } };
  }
  if (view === ALL_ID || view === LINKS_ID || view === PHOTOS_ID) {
    return { createdAt: { $gte: after } };
  }
  return { channelId: view, createdAt: { $gte: after } };
}

function pageFromBatch(docs: RxDocument<MessageDoc>[]): PageResult {
  return {
    docs: sortAscending(docs),
    nextCursor: oldestCreatedAt(docs),
    hasMore: docs.length === PAGE_SIZE,
  };
}

function mergeDocs(
  left: RxDocument<MessageDoc>[],
  right: RxDocument<MessageDoc>[],
): RxDocument<MessageDoc>[] {
  const byId = new Map<string, RxDocument<MessageDoc>>();
  for (const doc of left) byId.set(doc.id, doc);
  for (const doc of right) byId.set(doc.id, doc);
  return sortAscending([...byId.values()]);
}

function sortAscending(
  docs: RxDocument<MessageDoc>[],
): RxDocument<MessageDoc>[] {
  return [...docs].sort((a, b) => a.createdAt - b.createdAt);
}

function oldestCreatedAt(docs: RxDocument<MessageDoc>[]): number | null {
  if (docs.length === 0) return null;
  return Math.min(...docs.map((doc) => doc.createdAt));
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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
