import type { RefObject } from "react";
import IconArrowUp from "~icons/lucide/arrow-up";
import IconImage from "~icons/lucide/image";
import IconPaperclip from "~icons/lucide/paperclip";
import IconX from "~icons/lucide/x";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";
import type { PendingAttachment } from "./types";

interface Props {
  pending: PendingAttachment[];
  composerKey: number;
  composerRef: RefObject<MarkdownEditorHandle>;
  fileInputRef: RefObject<HTMLInputElement>;
  placeholder: string;
  channels: { id: string; name: string }[];
  onAddFiles: (files: File[]) => void;
  onRemovePending: (tempId: string) => void;
  onSend: (raw: string) => void;
}

export function MessageComposer({
  pending,
  composerKey,
  composerRef,
  fileInputRef,
  placeholder,
  channels,
  onAddFiles,
  onRemovePending,
  onSend,
}: Props) {
  return (
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
                onClick={() => onRemovePending(item.tempId)}
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
            if (files.length) onAddFiles(files);
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
            placeholder={placeholder}
            channels={channels}
            onSubmit={(t) => onSend(t)}
            onAddFiles={onAddFiles}
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
  );
}
