import { DEFAULT_CHANNEL_ID, type ChannelDoc } from "@aside/shared";
import { useEffect, useState } from "react";
import type { RxDocument } from "rxdb";
import IconInbox from "~icons/lucide/inbox";
import IconPlus from "~icons/lucide/plus";
import IconTrash from "~icons/lucide/trash-2";
import type { ChannelCollection } from "../../db/database";
import { slugifyChannelName } from "./channelName";
import { HOME_ID } from "./home";

interface Props {
  collection: ChannelCollection;
  selectedId: string;
  onSelect: (id: string) => void;
}

export function ChannelSidebar({ collection, selectedId, onSelect }: Props) {
  const [channels, setChannels] = useState<RxDocument<ChannelDoc>[]>([]);
  const [draftName, setDraftName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  useEffect(() => {
    const sub = collection.find().$.subscribe((found) => {
      // Default channel pinned to the top, then oldest-created first.
      const sorted = [...found].sort((a, b) => {
        if (a.id === DEFAULT_CHANNEL_ID) return -1;
        if (b.id === DEFAULT_CHANNEL_ID) return 1;
        return a.createdAt - b.createdAt;
      });
      setChannels(sorted);
    });
    return () => sub.unsubscribe();
  }, [collection]);

  async function createChannel(e: React.FormEvent) {
    e.preventDefault();
    const name = slugifyChannelName(draftName);
    if (!name) return;
    const existing = await collection.findOne({ selector: { name } }).exec();
    if (existing) {
      onSelect(existing.id);
      setDraftName("");
      return;
    }
    const now = Date.now();
    const doc = await collection.insert({
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
    });
    setDraftName("");
    onSelect(doc.id);
  }

  async function commitRename(doc: RxDocument<ChannelDoc>) {
    const name = slugifyChannelName(editDraft);
    setEditingId(null);
    if (!name || name === doc.name) return;
    await doc.incrementalPatch({ name, updatedAt: Date.now() });
  }

  async function deleteChannel(doc: RxDocument<ChannelDoc>) {
    // Bump-then-remove: incrementalPatch returns the doc at its new revision;
    // remove() must run on that, not the stale reference, or RxDB throws CONFLICT.
    const bumped = await doc.incrementalPatch({ updatedAt: Date.now() });
    await bumped.remove();
    if (selectedId === doc.id) onSelect(HOME_ID);
  }

  return (
    <aside className="flex h-full min-h-0 flex-col bg-sidebar">
      <header className="flex h-12 shrink-0 items-center border-b border-divider px-4 font-semibold shadow-sm">
        Aside
      </header>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <button
          type="button"
          onClick={() => onSelect(HOME_ID)}
          className={`mb-3 flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm ${
            selectedId === HOME_ID
              ? "bg-active text-ink"
              : "text-muted hover:bg-hover hover:text-ink"
          }`}
        >
          <IconInbox className="h-4 w-4" />
          Home
        </button>

        <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          Channels
        </p>
        <ul className="flex flex-col gap-0.5">
          {channels.map((doc) => {
            const active = doc.id === selectedId;
            const isEditing = editingId === doc.id;
            return (
              <li key={doc.id}>
                {isEditing ? (
                  <input
                    autoFocus
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onBlur={() => void commitRename(doc)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename(doc);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="w-full rounded bg-rail px-2 py-1 text-sm text-ink outline-none ring-1 ring-accent"
                  />
                ) : (
                  <div
                    className={`group flex items-center gap-1 rounded px-2 py-1 ${
                      active
                        ? "bg-active text-ink"
                        : "text-muted hover:bg-hover hover:text-ink"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(doc.id)}
                      onDoubleClick={() => {
                        setEditingId(doc.id);
                        setEditDraft(doc.name);
                      }}
                      className="min-w-0 flex-1 truncate text-left text-sm"
                      title="Click to open · double-click to rename"
                    >
                      <span className="text-muted">#</span> {doc.name}
                    </button>
                    {doc.id !== DEFAULT_CHANNEL_ID && (
                      <button
                        type="button"
                        onClick={() => void deleteChannel(doc)}
                        aria-label={`Delete #${doc.name}`}
                        className="hidden shrink-0 rounded p-1 text-muted hover:text-danger group-hover:block"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <form
        onSubmit={createChannel}
        className="flex shrink-0 gap-2 border-t border-divider p-3"
      >
        <input
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          placeholder="new-channel"
          className="min-w-0 flex-1 rounded bg-rail px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
        <button
          type="submit"
          aria-label="Create channel"
          className="flex shrink-0 items-center rounded bg-accent px-3 text-white hover:opacity-90"
        >
          <IconPlus className="h-4 w-4" />
        </button>
      </form>
    </aside>
  );
}
