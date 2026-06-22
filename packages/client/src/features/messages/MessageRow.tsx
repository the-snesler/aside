import type {
  AttachmentDoc,
  ChannelDoc,
  EmbedDoc,
  MessageDoc,
} from "@aside/shared";
import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
} from "@floating-ui/react";
import type { RxDocument } from "rxdb";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import IconCopy from "~icons/lucide/copy";
import IconPin from "~icons/lucide/pin";
import IconPinOff from "~icons/lucide/pin-off";
import IconTags from "~icons/lucide/tags";
import IconTrash from "~icons/lucide/trash-2";
import { blobUrl } from "../attachments/api";
import { messageChannelIds } from "../channels/membership";
import { useLightbox, type LightboxImage } from "../lightbox/LightboxProvider";
import { AttachmentCards } from "./AttachmentCards";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { Markdown } from "./Markdown";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";
import { formatTime } from "./timeline";
import { useIsTouch } from "./useIsTouch";

export function MessageRow({
  doc,
  smartView,
  channels,
  channelNames,
  isEditing,
  channelPickerOpen,
  highlighted,
  embeds,
  attachments,
  pinned,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onSaveDate,
  onToggleTask,
  onCopy,
  onDelete,
  onTogglePin,
  onToggleChannelPicker,
  onCloseChannelPicker,
  onToggleChannel,
  onLongPress,
}: {
  doc: RxDocument<MessageDoc>;
  smartView: boolean;
  channels: RxDocument<ChannelDoc>[];
  channelNames: Map<string, string>;
  isEditing: boolean;
  channelPickerOpen: boolean;
  highlighted?: boolean;
  embeds?: EmbedDoc[];
  attachments?: RxDocument<AttachmentDoc>[];
  pinned: boolean;
  onStartEdit: (doc: RxDocument<MessageDoc>) => void;
  onCancelEdit: () => void;
  onSaveEdit: (doc: RxDocument<MessageDoc>, raw: string) => Promise<void>;
  onSaveDate: (doc: RxDocument<MessageDoc>, createdAt: number) => Promise<void>;
  onToggleTask: (
    doc: RxDocument<MessageDoc>,
    nextText: string,
  ) => Promise<void>;
  onCopy: (doc: RxDocument<MessageDoc>) => Promise<void>;
  onDelete: (doc: RxDocument<MessageDoc>) => Promise<void>;
  onTogglePin: (doc: RxDocument<MessageDoc>) => Promise<void>;
  onToggleChannelPicker: (doc: RxDocument<MessageDoc>) => void;
  onCloseChannelPicker: () => void;
  onToggleChannel: (
    doc: RxDocument<MessageDoc>,
    channelId: string,
  ) => Promise<void>;
  onLongPress: (doc: RxDocument<MessageDoc>) => void;
}) {
  const lightbox = useLightbox();
  const isTouch = useIsTouch();
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const [dateEditorOpen, setDateEditorOpen] = useState(false);
  const [dateValue, setDateValue] = useState(() =>
    toDateTimeInputValue(doc.createdAt),
  );
  const dateFloating = useFloating({
    open: dateEditorOpen,
    onOpenChange: setDateEditorOpen,
    placement: "bottom-start",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });
  const channelFloating = useFloating({
    open: channelPickerOpen,
    onOpenChange: (open) => {
      if (!open) onCloseChannelPicker();
    },
    placement: "bottom-end",
    whileElementsMounted: autoUpdate,
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  });
  const {
    getReferenceProps: getDateReferenceProps,
    getFloatingProps: getDateFloatingProps,
  } = useInteractions([
    useDismiss(dateFloating.context),
    useRole(dateFloating.context, { role: "dialog" }),
  ]);
  const {
    getReferenceProps: getChannelReferenceProps,
    getFloatingProps: getChannelFloatingProps,
  } = useInteractions([
    useDismiss(channelFloating.context),
    useRole(channelFloating.context, { role: "menu" }),
  ]);
  // Long-press → action sheet on touch. A timer started on pointer-down fires
  // unless the finger moves (a scroll) or lifts first.
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);

  function clearPress() {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  }

  useEffect(() => {
    if (isEditing) {
      setDateEditorOpen(false);
      onCloseChannelPicker();
    }
  }, [isEditing, onCloseChannelPicker]);

  const channelIds = messageChannelIds(doc);
  const channelLabel = channelIds
    .map((channelId) => channelNames.get(channelId))
    .filter((name): name is string => !!name)
    .join(", ");

  // The message's previewable images, in visual order (embeds render above
  // attachments), so the lightbox can arrow across all of them as one set.
  const embedImages = (embeds ?? []).filter(
    (embed): embed is EmbedDoc & { image: string } => !!embed.image,
  );
  const attachmentImages = (attachments ?? []).filter((a) =>
    a.mimeType.startsWith("image/"),
  );
  const messageImages: LightboxImage[] = [
    ...embedImages.map((embed) => ({
      src: embed.image,
      caption: embed.title ?? embed.siteName,
      sourceUrl: embed.url,
    })),
    ...attachmentImages.map((a) => ({
      src: blobUrl(a.blobHash),
      downloadUrl: blobUrl(a.blobHash),
      caption: a.fileName,
    })),
  ];

  function openEmbedImage(embed: EmbedDoc) {
    const i = embedImages.findIndex((candidate) => candidate.id === embed.id);
    if (i !== -1) lightbox.open(messageImages, i);
  }

  function openAttachmentImage(attachment: RxDocument<AttachmentDoc>) {
    const i = attachmentImages.indexOf(attachment);
    if (i !== -1) lightbox.open(messageImages, embedImages.length + i);
  }

  function handleRowClick(e: MouseEvent<HTMLDivElement>) {
    if (isEditing || e.defaultPrevented || e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (window.getSelection()?.toString()) return;
    const target = e.target;
    if (
      target instanceof Element &&
      target.closest(
        'a, button, input, textarea, select, [role="button"], [data-no-row-edit]',
      )
    ) {
      return;
    }
    onStartEdit(doc);
  }

  async function saveDate() {
    const next = new Date(dateValue).getTime();
    if (!Number.isFinite(next) || next < 0 || next === doc.createdAt) {
      setDateEditorOpen(false);
      return;
    }
    await onSaveDate(doc, next);
    setDateEditorOpen(false);
  }

  return (
    <div
      draggable={!isEditing}
      onClick={handleRowClick}
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-aside-message-id", doc.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onPointerDown={(e) => {
        if (!isTouch || isEditing || e.pointerType === "mouse") return;
        pressStart.current = { x: e.clientX, y: e.clientY };
        pressTimer.current = setTimeout(() => onLongPress(doc), 450);
      }}
      onPointerMove={(e) => {
        const start = pressStart.current;
        if (!start) return;
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 10)
          clearPress();
      }}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      onContextMenu={(e) => {
        // Suppress the OS long-press/right-click menu so ours shows instead.
        if (isTouch) e.preventDefault();
      }}
      className={`group w-full relative flex gap-3 rounded-xl px-2 py-(--msg-pad-y) transition-all hover:bg-hover md:px-3 ${
        highlighted ? "bg-active ring-2 ring-accent/60" : ""
      }`}
    >
      <span className="relative w-14 shrink-0 pt-0.5 text-right text-[0.65rem] tabular-nums text-muted">
        <button
          type="button"
          ref={dateFloating.refs.setReference}
          {...getDateReferenceProps({
            onClick: () => {
              setDateValue(toDateTimeInputValue(doc.createdAt));
              setDateEditorOpen((open) => !open);
            },
          })}
          className="rounded py-0.5 tabular-nums hover:bg-panel hover:text-ink"
          aria-label="Edit note date"
        >
          {formatTime(doc.createdAt)}
        </button>
        {dateEditorOpen && (
          <FloatingPortal>
            <form
              ref={dateFloating.refs.setFloating}
              style={dateFloating.floatingStyles}
              {...getDateFloatingProps({
                onSubmit: (e) => {
                  e.preventDefault();
                  void saveDate();
                },
              })}
              data-no-row-edit
              className="z-30 w-64 rounded-xl bg-panel p-3 text-left text-sm shadow-xl ring-1 ring-divider"
            >
              <label className="block text-xs font-medium uppercase tracking-wide text-muted">
                Date
              </label>
              <input
                type="datetime-local"
                min="1970-01-01T00:00"
                value={dateValue}
                onChange={(e) => setDateValue(e.target.value)}
                className="mt-1 w-full rounded-lg bg-chat px-2 py-1.5 text-ink outline-none ring-1 ring-divider focus:ring-accent"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDateEditorOpen(false)}
                  className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-hover hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </form>
          </FloatingPortal>
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[var(--msg-gap)]">
        {smartView && (
          <span className="w-fit rounded-md bg-hover px-2 py-0.5 text-[11px] font-medium text-muted">
            <span className="opacity-60">#</span> {channelLabel || "unknown"}
          </span>
        )}
        {isEditing ? (
          <div className="min-w-0 flex-1">
            <MarkdownEditor
              key={doc.id}
              ref={editorRef}
              initialValue={doc.text}
              autoFocus
              channels={channels}
              submitOnEnter={!isTouch}
              onSubmit={(text) => void onSaveEdit(doc, text)}
              onCancel={onCancelEdit}
              className="max-h-[50vh] w-full overflow-y-auto rounded-xl bg-panel px-3 py-2 text-ink outline-none ring-1 ring-accent"
            />
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => editorRef.current?.submit()}
                className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-lg px-3 py-1.5 text-sm text-muted hover:bg-hover hover:text-ink"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {doc.text && (
              <Markdown
                text={doc.text}
                className="break-words text-ink"
                onToggleTask={(nextText) => void onToggleTask(doc, nextText)}
              />
            )}
            {embeds?.map((embed) => (
              <LinkPreviewCard
                key={embed.id}
                embed={embed}
                onPreviewImage={
                  embed.image ? () => openEmbedImage(embed) : undefined
                }
              />
            ))}
            <AttachmentCards
              items={attachments}
              onPreviewImage={openAttachmentImage}
            />
          </>
        )}
      </div>
      {!isEditing && (
        <span
          className={`absolute right-2 top-0 -translate-y-1/2 items-center gap-0.5 rounded-lg bg-panel px-1 py-0.5 shadow-md ring-1 ring-divider ${
            channelPickerOpen ? "flex" : "hidden group-hover:flex"
          }`}
        >
          <button
            type="button"
            onClick={() => void onTogglePin(doc)}
            aria-label={pinned ? "Unpin" : "Pin"}
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink"
          >
            {pinned ? (
              <IconPinOff className="h-4 w-4" />
            ) : (
              <IconPin className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            ref={channelFloating.refs.setReference}
            {...getChannelReferenceProps({
              onClick: () => onToggleChannelPicker(doc),
            })}
            aria-label="Edit spaces"
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink"
          >
            <IconTags className="h-4 w-4" />
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
      {!isEditing && channelPickerOpen && (
        <FloatingPortal>
          <div
            ref={channelFloating.refs.setFloating}
            style={channelFloating.floatingStyles}
            {...getChannelFloatingProps()}
            data-no-row-edit
            className="z-30 w-56 rounded-xl bg-panel p-2 text-sm shadow-xl ring-1 ring-divider"
          >
            {channels.map((channel) => {
              const checked = channelIds.includes(channel.id);
              const disabled = checked && channelIds.length === 1;
              return (
                <label
                  key={channel.id}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${
                    disabled ? "text-muted" : "text-ink hover:bg-hover"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={disabled}
                    onChange={() => void onToggleChannel(doc, channel.id)}
                    className="h-4 w-4 accent-[var(--color-accent)]"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    <span className="text-muted">#</span> {channel.name}
                  </span>
                </label>
              );
            })}
          </div>
        </FloatingPortal>
      )}
    </div>
  );
}

function toDateTimeInputValue(ts: number): string {
  const date = new Date(ts);
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(ts - offsetMs).toISOString().slice(0, 16);
}
