import { DEFAULT_CHANNEL_ID, type ChannelDoc } from "@aside/shared";
import { useEffect, useState } from "react";
import type { RxDocument } from "rxdb";
import IconLink from "~icons/lucide/link";
import IconList from "~icons/lucide/list";
import IconPlus from "~icons/lucide/plus";
import IconSearch from "~icons/lucide/search";
import IconSettings from "~icons/lucide/settings";
import IconSparkles from "~icons/lucide/sparkles";
import IconTrash from "~icons/lucide/trash-2";
import type { ChannelCollection } from "../../db/database";
import { ALL_ID, LINKS_ID, TODAY_ID, type NoteCounts } from "../views";
import { channelColor } from "./channelColor";
import { slugifyChannelName } from "./channelName";

interface Props {
  collection: ChannelCollection;
  counts: NoteCounts;
  selectedView: string;
  onSelect: (view: string) => void;
  onOpenSettings: () => void;
}

export function ChannelSidebar({
  collection,
  counts,
  selectedView,
  onSelect,
  onOpenSettings,
}: Props) {
  const [channels, setChannels] = useState<RxDocument<ChannelDoc>[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");

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
    setDraftName("");
    setCreating(false);
    if (!name) return;
    const existing = await collection.findOne({ selector: { name } }).exec();
    if (existing) {
      onSelect(existing.id);
      return;
    }
    const now = Date.now();
    const doc = await collection.insert({
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
    });
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
    if (selectedView === doc.id) onSelect(ALL_ID);
  }

  const smartNav = [
    { id: ALL_ID, label: "All Notes", Icon: IconList, count: counts.all },
    { id: TODAY_ID, label: "Today", Icon: IconSparkles, count: counts.today },
    { id: LINKS_ID, label: "Links", Icon: IconLink, count: counts.links },
  ];

  return (
    <aside
      className="hidden h-full min-h-0 w-[268px] shrink-0 flex-col overflow-hidden md:flex md:pr-5"
    >
      <header className="flex h-14 shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <img src="/aside-logo.svg" alt="" className="h-7 w-7" />
          <span className="text-lg font-semibold text-ink">Aside</span>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Feeds settings"
          title="Feeds"
          className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <IconSettings className="h-4 w-4" />
        </button>
      </header>

      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-xl bg-panel/60 px-3 py-2 text-sm text-muted shadow-sm ring-1 ring-divider">
          <IconSearch className="h-4 w-4" />
          <span className="flex-1 truncate">Jot or search…</span>
          <kbd className="rounded bg-hover px-1.5 py-0.5 font-mono text-[11px] text-muted">
            ⌘K
          </kbd>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="flex flex-col gap-0.5">
          {smartNav.map(({ id, label, Icon, count }) => {
            const active = selectedView === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${active
                    ? "bg-active text-ink shadow-sm"
                    : "text-ink/80 hover:bg-hover"
                    }`}
                >
                  <Icon
                    className={`h-4 w-4 ${active ? "text-accent" : "text-muted"}`}
                  />
                  <span className="flex-1 text-left">{label}</span>
                  <span
                    className={`text-xs tabular-nums ${active ? "text-accent" : "text-muted"}`}
                  >
                    {count}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="px-3 pb-1 pt-5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          Spaces
        </p>
        <ul className="flex flex-col gap-0.5">
          {channels.map((doc) => {
            const active = doc.id === selectedView;
            const isEditing = editingId === doc.id;
            const count = counts.byChannel.get(doc.id) ?? 0;
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
                    className="w-full rounded-xl bg-panel px-3 py-1.5 text-sm text-ink outline-none ring-1 ring-accent"
                  />
                ) : (
                  <div
                    className={`group flex items-center gap-2.5 rounded-xl px-3 py-2 transition-colors ${active ? "bg-active text-ink shadow-sm" : "hover:bg-hover"
                      }`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(doc.id)}
                      onDoubleClick={() => {
                        setEditingId(doc.id);
                        setEditDraft(doc.name);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                      title="Click to open · double-click to rename"
                    >
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-[5px]"
                        style={{ backgroundColor: channelColor(doc.name) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink/90">
                        <span className="text-muted">#</span> {doc.name}
                      </span>
                    </button>
                    {doc.id !== DEFAULT_CHANNEL_ID && (
                      <button
                        type="button"
                        onClick={() => void deleteChannel(doc)}
                        aria-label={`Delete #${doc.name}`}
                        className="hidden shrink-0 rounded p-0.5 text-muted hover:text-danger group-hover:block"
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <span
                      className={`shrink-0 text-xs tabular-nums ${active ? "text-accent" : "text-muted"} ${doc.id !== DEFAULT_CHANNEL_ID ? "group-hover:hidden" : ""}`}
                    >
                      {count}
                    </span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 px-3 py-3">
        {creating ? (
          <form onSubmit={createChannel}>
            <input
              autoFocus
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setCreating(false);
                  setDraftName("");
                }
              }}
              placeholder="new-space"
              className="w-full rounded-xl bg-panel px-3 py-2 text-sm text-ink outline-none ring-1 ring-accent placeholder:text-muted"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <IconPlus className="h-4 w-4" />
            New space
          </button>
        )}
      </div>
    </aside>
  );
}
