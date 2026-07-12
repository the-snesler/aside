import { useCallback, useState } from "react";
import type {
  AttachmentCollection,
  ChannelCollection,
  MessageCollection,
} from "../../db/database";
import { notesToMarkdown } from "./markdown";
import { downloadTextFile } from "./download";

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
      const md = notesToMarkdown(
        m.map((d) => d.toMutableJSON()),
        c.map((d) => d.toMutableJSON()),
        a.map((d) => d.toMutableJSON()),
      );
      downloadTextFile("aside-notes.md", md);
    } finally {
      setBusy(false);
    }
  }, [messages, channels, attachments]);

  return (
    <div className="rounded-lg border border-divider bg-panel p-4">
      <p className="text-sm text-muted">
        Download all your notes as a single Markdown file. Channels become
        headings; attachments become links.
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
