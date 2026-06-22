import type { ChannelDoc } from "@aside/shared";
import { useEffect, useState } from "react";
import type { RxDocument } from "rxdb";
import IconImage from "~icons/lucide/image";
import IconLink from "~icons/lucide/link";
import IconList from "~icons/lucide/list";
import IconLogOut from "~icons/lucide/log-out";
import IconPlus from "~icons/lucide/plus";
import IconSearch from "~icons/lucide/search";
import IconSettings from "~icons/lucide/settings";
import IconSparkles from "~icons/lucide/sparkles";
import type { ChannelCollection } from "../../db/database";
import {
  ALL_ID,
  LINKS_ID,
  PHOTOS_ID,
  TODAY_ID,
  type NoteCounts,
} from "../views";
import { channelColor, nextSortOrder, sortChannels } from "./channelMeta";
import { slugifyChannelName } from "./channelName";

// Dropping a note onto a channel button files it there; MessageRow stamps the
// dragged note's id onto the dataTransfer under this MIME type.
const MESSAGE_DRAG_TYPE = "application/x-aside-message-id";
const CHANNEL_DRAG_TYPE = "application/x-aside-channel-id";

function AsideLogo() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="h-7 w-7"
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      fillRule="evenodd"
      clipRule="evenodd"
      strokeLinejoin="round"
      strokeMiterlimit={2}
    >
      <g transform="translate(-512 -176)">
        <rect x="512" y="176" width="512" height="512" fill="none" />
        <g transform="matrix(0.5146 -0.323999 0.518757 0.82393 425.152915 328.817788)">
          <path
            d="M456.212,203.692L456.212,344.818C456.16,357.299 443.65,364.439 441.496,365.668C439.341,366.898 426.78,374.067 406.925,372.948C387.07,371.829 376.767,363.371 374.999,361.92C370.409,358.153 368.412,354.365 368.038,353.656C365.53,348.903 366.904,348.678 364.318,343.945C360.017,336.074 348.447,328.036 336.005,333.996C327.82,337.916 322.143,346.013 322.897,355.121C323.122,357.839 323.255,357.841 322.791,360.549C320.616,373.234 306.373,379.527 303.942,380.601C287.267,387.968 270.29,385.454 267.392,385.025C247.518,382.082 239.314,372.465 237.914,370.823C235.644,368.163 235.917,368.088 234.249,365.26C229.668,357.495 216.696,348.656 203.036,357.924C198.06,361.299 192.533,367.898 193.233,377.132C193.423,379.641 193.491,379.643 193.039,382.138C190.803,394.504 177.041,400.748 174.681,401.819C172.32,402.89 158.559,409.133 139.037,406.638C136.179,406.273 119.515,404.143 109.289,393.462C108.006,392.122 106.898,390.71 105.988,389.256C104.198,386.399 104.538,386.338 103.334,383.367C99.721,374.448 88.657,366.667 77.369,369.975C70.376,372.024 60.919,379.041 60.828,390.867C60.806,393.729 60.806,393.736 59.881,396.539C59.328,398.213 56.175,407.763 40.744,414.238C33.232,417.39 25.947,418.303 24.571,418.475C23.146,418.653 15.482,419.614 6.403,418.445C3.724,418.1 -11.567,416.13 -21.934,406.493C-26.981,401.801 -28.442,397.251 -28.718,396.392C-28.919,395.766 -29.768,393.125 -29.567,388.432C-27.628,343.07 29.239,308.395 94.591,313.119C108.562,314.128 121.963,316.924 134.19,321.274C167.313,297.389 217.136,291.556 258.452,303.429C259.107,302.883 259.779,302.34 260.467,301.798C287.887,280.208 328.32,271.93 365.744,276.793C365.665,164.363 365.44,163.482 366.105,157.504C371.049,113.085 428.471,80.411 492.747,86.163C536.449,90.074 572.105,111.133 585.217,139.105C601.663,130.254 618.156,121.435 634.291,112.364L634.381,112.425C634.463,112.375 634.545,112.324 634.627,112.274C636.041,111.408 643.873,106.614 657.297,106.059C674.323,105.356 684.485,111.946 686.205,113.062C687.616,113.977 695.573,119.138 696.525,127.575C696.67,128.857 697.486,136.087 689.46,143.022C688.171,144.136 686.7,145.17 685.143,146.142C672.549,153.999 659.873,161.805 647.195,169.61C658.7,173.606 670.19,177.619 681.565,181.757C688.821,184.397 693.64,188.728 694.455,189.46C704.908,198.853 702.356,208.5 701.913,210.176C701.455,211.907 698.809,221.915 683.202,228.737C680.974,229.711 668.148,235.318 650.067,233.491C648.659,233.349 640.337,232.508 633.375,229.561L590.176,211.329C590.123,272.149 591.565,337.218 590.529,390.939C590.528,390.987 590.528,391.033 590.527,391.079C590.482,393.504 590.527,393.554 589.81,396.035C589.269,397.908 586.08,408.95 567.856,415.471C565.217,416.416 549.653,421.985 529.965,417.473C527.113,416.819 510.299,412.966 503.176,400.667C502.289,399.136 501.614,397.55 501.166,395.945C500.718,394.341 500.516,392.707 500.498,391.079C500.498,391.056 500.498,391.034 500.497,391.012L500.254,391.012C500.262,389.611 500.269,388.236 500.276,386.888C499.39,376.891 496.385,366.684 500.396,357.113C500.505,315.163 500.192,304.168 499.835,244.258C499.737,227.851 499.72,214.798 499.747,204.37C485.235,204.145 470.724,203.916 456.212,203.692ZM500.122,167.476C500.212,162.145 500.185,160.975 499.787,159.079C497.517,148.253 484.972,139.706 473.524,142.585C465.22,144.674 456.213,152.562 456.212,163.65L456.212,168.705C470.849,168.294 485.486,167.889 500.122,167.476Z"
            fill="var(--color-accent)"
          />
        </g>
      </g>
    </svg>
  );
}

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
    <aside className="absolute inset-y-0 left-0 z-0 flex h-full min-h-0 w-[280px] shrink-0 flex-col overflow-hidden pr-3 md:relative md:w-[268px] md:pr-5">
      <header className="flex h-14 shrink-0 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <AsideLogo />
          <span className="text-lg font-semibold text-ink">Aside</span>
        </div>
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
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
            className="rounded p-1 text-muted hover:bg-hover hover:text-ink"
          >
            <IconLogOut className="h-4 w-4" />
          </button>
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
                    className={`group relative rounded-xl transition-opacity ${dropTargetId === doc.id ? "ring-2 ring-accent" : ""
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
                        className={`pointer-events-none absolute inset-x-2 z-10 h-0.5 rounded-full bg-accent ${dropEdge.edge === "top" ? "-top-0.5" : "-bottom-0.5"
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
                      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition-colors ${active
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
