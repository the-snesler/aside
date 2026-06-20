import type {
  AttachmentDoc,
  ChannelDoc,
  EmbedDoc,
  MessageDoc,
} from "@aside/shared";
import type { RxDocument } from "rxdb";
import { useRef } from "react";
import IconCopy from "~icons/lucide/copy";
import IconPencil from "~icons/lucide/pencil";
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
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onToggleTask,
  onCopy,
  onDelete,
  onToggleChannelPicker,
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
  onStartEdit: (doc: RxDocument<MessageDoc>) => void;
  onCancelEdit: () => void;
  onSaveEdit: (doc: RxDocument<MessageDoc>, raw: string) => Promise<void>;
  onToggleTask: (
    doc: RxDocument<MessageDoc>,
    nextText: string,
  ) => Promise<void>;
  onCopy: (doc: RxDocument<MessageDoc>) => Promise<void>;
  onDelete: (doc: RxDocument<MessageDoc>) => Promise<void>;
  onToggleChannelPicker: (doc: RxDocument<MessageDoc>) => void;
  onToggleChannel: (
    doc: RxDocument<MessageDoc>,
    channelId: string,
  ) => Promise<void>;
  onLongPress: (doc: RxDocument<MessageDoc>) => void;
}) {
  const lightbox = useLightbox();
  const isTouch = useIsTouch();
  const editorRef = useRef<MarkdownEditorHandle>(null);
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

  return (
    <div
      draggable={!isEditing}
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
      className={`group w-full relative flex gap-3 rounded-xl px-2 py-2 transition-all hover:bg-hover md:px-3 ${
        highlighted ? "bg-active ring-2 ring-accent/60" : ""
      }`}
    >
      <span className="w-11 shrink-0 pt-0.5 text-right text-xs tabular-nums text-muted">
        {formatTime(doc.createdAt)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
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
        <span className="absolute right-2 top-0 hidden -translate-y-1/2 items-center gap-0.5 rounded-lg bg-panel px-1 py-0.5 shadow-md ring-1 ring-divider group-hover:flex">
          <button
            type="button"
            onClick={() => onToggleChannelPicker(doc)}
            aria-label="Edit spaces"
            className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink"
          >
            <IconTags className="h-4 w-4" />
          </button>
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
      {!isEditing && channelPickerOpen && (
        <div className="absolute right-2 top-6 z-20 w-56 rounded-xl bg-panel p-2 text-sm shadow-xl ring-1 ring-divider">
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
      )}
    </div>
  );
}
