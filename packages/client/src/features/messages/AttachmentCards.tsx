import type { AttachmentDoc } from "@aside/shared";
import type { RxDocument } from "rxdb";
import IconPaperclip from "~icons/lucide/paperclip";
import { blobUrl } from "../attachments/api";

/**
 * Renders a message's attachments below its body (ATT-3): images as inline
 * preview cards, other files as a download chip. When `onPreviewImage` is
 * provided, clicking an image opens the lightbox; otherwise it falls back to
 * opening the full blob in a new tab.
 */
export function AttachmentCards({
  items,
  onPreviewImage,
}: {
  items?: RxDocument<AttachmentDoc>[];
  onPreviewImage?: (attachment: RxDocument<AttachmentDoc>) => void;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-2">
      {items.map((a) =>
        a.mimeType.startsWith("image/") ? (
          onPreviewImage ? (
            <button
              key={a.id}
              type="button"
              onClick={() => onPreviewImage(a)}
              className="block cursor-zoom-in"
            >
              <img
                src={blobUrl(a.blobHash)}
                alt={a.fileName}
                loading="lazy"
                className="max-h-80 max-w-xs rounded-xl border border-divider object-cover"
              />
            </button>
          ) : (
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
          )
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
