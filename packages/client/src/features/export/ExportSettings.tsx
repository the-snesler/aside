import { useCallback, useState } from "react";
import { strToU8, zipSync } from "fflate";
import type {
  AttachmentCollection,
  ChannelCollection,
  MessageCollection,
} from "../../db/database";
import { notesToMarkdownFiles } from "./markdown";
import { downloadFile } from "./download";

export function ExportSettings({
  messages,
  channels,
  attachments,
}: {
  messages: MessageCollection;
  channels: ChannelCollection;
  attachments: AttachmentCollection;
}) {
  const [busy, setBusy] = useState(false);

  const handleExport = useCallback(async () => {
    setBusy(true);
    try {
      const [m, c, a] = await Promise.all([
        messages.find().exec(),
        channels.find().exec(),
        attachments.find().exec(),
      ]);
      const files = notesToMarkdownFiles(
        m.map((d) => d.toMutableJSON()),
        c.map((d) => d.toMutableJSON()),
        a.map((d) => d.toMutableJSON()),
      );
      const zippable: Record<string, Uint8Array> = {};
      for (const file of files) zippable[file.path] = strToU8(file.content);
      const zipped = zipSync(zippable);
      downloadFile("aside-notes.zip", zipped, "application/zip");
    } finally {
      setBusy(false);
    }
  }, [messages, channels, attachments]);

  return (
    <div className="rounded-lg border border-divider bg-panel p-4">
      <p className="text-sm text-muted">
        Download all your notes as a zip of Markdown files, one per note,
        organized into a folder per channel.
      </p>
      <button
        type="button"
        onClick={() => void handleExport()}
        disabled={busy}
        className="mt-3 rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Exporting…" : "Export to Markdown"}
      </button>
    </div>
  );
}
