import type { ChannelDoc } from "@aside/shared";
import { useEffect, useState } from "react";
import type { RxDocument } from "rxdb";
import IconImage from "~icons/lucide/image";
import IconLink from "~icons/lucide/link";
import IconList from "~icons/lucide/list";
import IconLogOut from "~icons/lucide/log-out";
import IconSquareCheck from "~icons/lucide/square-check";
import IconPlus from "~icons/lucide/plus";
import IconSearch from "~icons/lucide/search";
import IconSettings from "~icons/lucide/settings";
import IconSparkles from "~icons/lucide/sparkles";
import IconBell from "~icons/lucide/bell";
import type { ChannelCollection } from "../../db/database";
import {
  ALL_ID,
  LINKS_ID,
  PHOTOS_ID,
  REMINDERS_ID,
  TASKS_ID,
  TODAY_ID,
  type NoteCounts,
} from "../views";
import { channelColor, nextSortOrder, sortChannels } from "./channelMeta";
import { slugifyChannelName } from "./channelName";
import LogoWide from "../../LogoWide";
import { useIsDemo } from "../../demo";

// Dropping a note onto a channel button files it there; MessageRow stamps the
// dragged note's id onto the dataTransfer under this MIME type.
const MESSAGE_DRAG_TYPE = "application/x-aside-message-id";
const CHANNEL_DRAG_TYPE = "application/x-aside-channel-id";

interface Props {
  collection: ChannelCollection;
  counts: NoteCounts;
  unreadChannelIds: Set<string>;
  selectedView: string;
  onSelect: (view: string) => void;
  onOpenSettings: () => void;
  onOpenChannelSettings: (channelId: string) => void;
  onOpenSearch: () => void;
  onLogout: () => void;
  onDropMessage: (channelId: string, messageId: string) => void;
}

export function ChannelSidebar({
  collection,
  counts,
  unreadChannelIds,
  selectedView,
  onSelect,
  onOpenSettings,
  onOpenChannelSettings,
  onOpenSearch,
  onLogout,
  onDropMessage,
}: Props) {
  const isDemo = useIsDemo();
  const [channels, setChannels] = useState<RxDocument<ChannelDoc>[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState("");
  // Channel currently under a dragged note, for the file-into-channel ring.
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dragChannelId, setDragChannelId] = useState<string | null>(null);
  // While reordering, which channel the insertion line sits above/below.
  const [dropEdge, setDropEdge] = useState<{
    id: string;
    edge: "top" | "bottom";
  } | null>(null);

  useEffect(() => {
    const sub = collection.find().$.subscribe((found) => {
      setChannels(sortChannels([...found]));
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
      sortOrder: nextSortOrder(channels),
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

  const smartNav = [
    { id: ALL_ID, label: "All Notes", Icon: IconList, count: counts.all },
    { id: TODAY_ID, label: "Today", Icon: IconSparkles, count: counts.today },
    {
      id: TASKS_ID,
      label: "Tasks",
      Icon: IconSquareCheck,
      count: counts.tasks,
    },
    {
      id: REMINDERS_ID,
      label: "Reminders",
      Icon: IconBell,
      count: counts.reminders,
    },
    { id: LINKS_ID, label: "Links", Icon: IconLink, count: counts.links },
    { id: PHOTOS_ID, label: "Photos", Icon: IconImage, count: counts.photos },
  ];

  // Reorder so `dragId` lands above (edge "top") or below (edge "bottom")
  // `hoverId`. Returns the new order, or null if it's a no-op.
  function computeReorder(
    dragId: string,
    hoverId: string,
    edge: "top" | "bottom",
  ): RxDocument<ChannelDoc>[] | null {
    const from = channels.findIndex((channel) => channel.id === dragId);
    const hover = channels.findIndex((channel) => channel.id === hoverId);
    if (from === -1 || hover === -1) return null;
    let insertBefore = edge === "top" ? hover : hover + 1;
    // Dropping into the slot it already occupies changes nothing.
    if (insertBefore === from || insertBefore === from + 1) return null;
    const ordered = [...channels];
    const [moved] = ordered.splice(from, 1);
    if (from < insertBefore) insertBefore -= 1;
    ordered.splice(insertBefore, 0, moved);
    return ordered;
  }

  async function persistOrder(ordered: RxDocument<ChannelDoc>[]) {
    setChannels(ordered);
    const now = Date.now();
    await Promise.all(
      ordered.map((channel, index) => {
        const sortOrder = index + 1;
        if (channel.sortOrder === sortOrder) return Promise.resolve();
        return channel.incrementalPatch({ sortOrder, updatedAt: now });
      }),
    );
  }

  return (
    <aside className="absolute inset-y-0 left-0 z-0 flex h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden pr-3 md:relative select-none md:w-[268px] md:pr-5">
      <header className="flex h-12 py-2 shrink-0 items-center justify-between px-4">
        <LogoWide />
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Settings"
            title="Settings"
            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <IconSettings className="h-4 w-4" />
          </button>
          {!isDemo && (
            <button
              type="button"
              onClick={onLogout}
              aria-label="Log out"
              title="Log out"
              className="rounded p-1 text-muted hover:bg-hover hover:text-ink"
            >
              <IconLogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </header>

      <div className="px-3 pb-2">
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex w-full items-center gap-2 rounded-xl bg-panel/60 px-3 py-2 text-left text-sm text-muted shadow-sm ring-1 ring-divider transition-colors hover:bg-panel hover:text-ink"
        >
          <IconSearch className="h-4 w-4" />
          <span className="flex-1 truncate">Jot or search…</span>
          <kbd className="rounded bg-hover px-1.5 py-0.5 font-mono text-[11px] text-muted">
            ⌘K
          </kbd>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-2">
        <ul className="flex flex-col gap-0.5">
          {smartNav.map(({ id, label, Icon, count }) => {
            const active = selectedView === id;
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                    active
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
          Channels
        </p>
        <ul className="flex flex-col gap-0.5">
          {channels.map((doc) => {
            const active = doc.id === selectedView;
            const isEditing = editingId === doc.id;
            const count = counts.byChannel.get(doc.id) ?? 0;
            const unread = unreadChannelIds.has(doc.id);
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
                    draggable
                    className={`group relative rounded-xl transition-opacity ${
                      dropTargetId === doc.id ? "ring-2 ring-accent" : ""
                    } ${dragChannelId === doc.id ? "opacity-40" : ""}`}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(CHANNEL_DRAG_TYPE, doc.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragChannelId(doc.id);
                    }}
                    onDragEnd={() => {
                      setDragChannelId(null);
                      setDropEdge(null);
                    }}
                    onDragOver={(e) => {
                      const isChannel =
                        e.dataTransfer.types.includes(CHANNEL_DRAG_TYPE);
                      const isMessage =
                        e.dataTransfer.types.includes(MESSAGE_DRAG_TYPE);
                      if (!isChannel && !isMessage) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = isChannel ? "move" : "copy";
                      if (isChannel) {
                        // Insertion line follows the pointer's half of the row.
                        const rect = e.currentTarget.getBoundingClientRect();
                        const edge: "top" | "bottom" =
                          e.clientY - rect.top < rect.height / 2
                            ? "top"
                            : "bottom";
                        const next =
                          dragChannelId &&
                          computeReorder(dragChannelId, doc.id, edge)
                            ? { id: doc.id, edge }
                            : null;
                        setDropEdge(next);
                        setDropTargetId(null);
                      } else {
                        setDropTargetId(doc.id);
                        setDropEdge(null);
                      }
                    }}
                    onDragLeave={() => {
                      setDropTargetId((id) => (id === doc.id ? null : id));
                      setDropEdge((e) => (e?.id === doc.id ? null : e));
                    }}
                    onDrop={(e) => {
                      const channelId =
                        e.dataTransfer.getData(CHANNEL_DRAG_TYPE);
                      const messageId =
                        e.dataTransfer.getData(MESSAGE_DRAG_TYPE);
                      const edge =
                        dropEdge?.id === doc.id ? dropEdge.edge : null;
                      setDropTargetId(null);
                      setDropEdge(null);
                      setDragChannelId(null);
                      if (!channelId && !messageId) return;
                      e.preventDefault();
                      if (channelId) {
                        if (!edge) return;
                        const ordered = computeReorder(channelId, doc.id, edge);
                        if (ordered) void persistOrder(ordered);
                      } else onDropMessage(doc.id, messageId);
                    }}
                  >
                    {dropEdge?.id === doc.id && (
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-accent ${
                          dropEdge.edge === "top" ? "-top-0.5" : "-bottom-0.5"
                        }`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => onSelect(doc.id)}
                      onDoubleClick={() => {
                        setEditingId(doc.id);
                        setEditDraft(doc.name);
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${
                        active
                          ? "bg-active text-ink shadow-sm"
                          : "hover:bg-hover"
                      }`}
                      title={
                        doc.description ||
                        "Click to open · double-click to rename"
                      }
                    >
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-[5px]"
                        style={{ backgroundColor: channelColor(doc) }}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink/90">
                        <span className="text-muted">#</span> {doc.name}
                      </span>
                      <span
                        className={`shrink-0 text-xs tabular-nums ${active ? "text-accent" : "text-muted"} group-hover:opacity-0`}
                      >
                        {count}
                      </span>
                      {unread && (
                        <span
                          title="New feed items"
                          className="h-2 w-2 shrink-0 rounded-full bg-accent group-hover:opacity-0"
                        />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenChannelSettings(doc.id)}
                      aria-label={`Settings for #${doc.name}`}
                      className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-muted hover:text-ink group-hover:block"
                    >
                      <IconSettings className="h-3.5 w-3.5" />
                    </button>
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
              placeholder="new-channel"
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
            New channel
          </button>
        )}
      </div>
    </aside>
  );
}
