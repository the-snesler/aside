import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import IconArrowDown from "~icons/lucide/arrow-down";
import IconArrowUp from "~icons/lucide/arrow-up";
import IconCornerDownLeft from "~icons/lucide/corner-down-left";
import IconHash from "~icons/lucide/hash";
import IconSearch from "~icons/lucide/search";
import IconX from "~icons/lucide/x";
import { channelColor } from "../channels/channelMeta";
import { isSmartView } from "../views";
import { buildSnippet } from "./highlight";
import type { SearchChannel, SearchNote, SearchSort } from "./searchIndex";

interface Props {
  open: boolean;
  activeView: string;
  channels: SearchChannel[];
  search: (
    query: string,
    options: { scopeChannelId?: string; sort: SearchSort },
  ) => { channels: SearchChannel[]; notes: SearchNote[] };
  onClose: () => void;
  onSelectView: (view: string) => void;
  onNavigateToNote: (channelId: string, messageId: string) => void;
}

type PaletteItem =
  | { kind: "channel"; channel: SearchChannel }
  | { kind: "note"; note: SearchNote };

export function SearchPalette({
  open,
  activeView,
  channels,
  search,
  onClose,
  onSelectView,
  onNavigateToNote,
}: Props) {
  const [query, setQuery] = useState("");
  const [scopeCurrent, setScopeCurrent] = useState(false);
  const [sort, setSort] = useState<SearchSort>("relevance");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const activeChannel = channels.find((channel) => channel.id === activeView);
  const scopedChannelId =
    scopeCurrent && activeChannel ? activeChannel.id : undefined;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setScopeCurrent(false);
    setSort("relevance");
    setSelectedIndex(0);
  }, [open]);

  const results = useMemo(
    () => search(query, { scopeChannelId: scopedChannelId, sort }),
    [query, scopedChannelId, search, sort],
  );

  const items: PaletteItem[] = useMemo(
    () => [
      ...results.channels.map(
        (channel) => ({ kind: "channel", channel }) as const,
      ),
      ...results.notes.map((note) => ({ kind: "note", note }) as const),
    ],
    [results],
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, scopedChannelId, sort]);

  if (!open) return null;

  function selectItem(item: PaletteItem) {
    if (item.kind === "channel") onSelectView(item.channel.id);
    else {
      const targetChannelId =
        !isSmartView(activeView) && item.note.channelIds.includes(activeView)
          ? activeView
          : item.note.channelIds[0];
      onNavigateToNote(targetChannelId, item.note.id);
    }
    onClose();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((index) => Math.min(index + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((index) => Math.max(index - 1, 0));
    } else if (e.key === "Enter" && items[selectedIndex]) {
      e.preventDefault();
      selectItem(items[selectedIndex]);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-3 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[76vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-panel shadow-2xl ring-1 ring-divider"
        role="dialog"
        aria-modal="true"
        aria-label="Search notes"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-divider px-4 py-3">
          <IconSearch className="h-5 w-5 shrink-0 text-muted" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search notes, previews, files, and channels"
            className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-muted"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b border-divider px-4 py-2">
          {activeChannel && (
            <button
              type="button"
              onClick={() => setScopeCurrent((value) => !value)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                scopeCurrent
                  ? "bg-active text-accent"
                  : "bg-hover text-muted hover:text-ink"
              }`}
            >
              {scopeCurrent ? `#${activeChannel.name}` : "All notes"}
            </button>
          )}
          <div className="flex rounded-full bg-hover p-0.5">
            {(["relevance", "newest", "oldest"] as SearchSort[]).map(
              (option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setSort(option)}
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize transition-colors ${
                    sort === option
                      ? "bg-panel text-ink shadow-sm"
                      : "text-muted"
                  }`}
                >
                  {option}
                </button>
              ),
            )}
          </div>
          <div className="ml-auto hidden items-center gap-2 text-[11px] text-muted sm:flex">
            <IconArrowUp className="h-3 w-3" />
            <IconArrowDown className="h-3 w-3" />
            <span>select</span>
            <IconCornerDownLeft className="h-3 w-3" />
            <span>open</span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
          {!query.trim() ? (
            <EmptyState text="Start typing to search your local notes." />
          ) : items.length === 0 ? (
            <EmptyState text="No matches found." />
          ) : (
            <>
              {results.channels.length > 0 && (
                <ResultSection label="Channels">
                  {results.channels.map((channel) => {
                    const index = items.findIndex(
                      (item) =>
                        item.kind === "channel" &&
                        item.channel.id === channel.id,
                    );
                    return (
                      <ChannelRow
                        key={channel.id}
                        channel={channel}
                        active={index === selectedIndex}
                        onSelect={() =>
                          selectItem({ kind: "channel", channel })
                        }
                      />
                    );
                  })}
                </ResultSection>
              )}
              {results.notes.length > 0 && (
                <ResultSection label="Notes">
                  {results.notes.map((note) => {
                    const index = items.findIndex(
                      (item) =>
                        item.kind === "note" && item.note.id === note.id,
                    );
                    const channelNames = note.channelIds
                      .map(
                        (id) =>
                          channels.find((candidate) => candidate.id === id)
                            ?.name,
                      )
                      .filter((name): name is string => !!name);
                    return (
                      <NoteRow
                        key={note.id}
                        note={note}
                        channelName={channelNames.join(", ") || "unknown"}
                        active={index === selectedIndex}
                        onSelect={() => selectItem({ kind: "note", note })}
                      />
                    );
                  })}
                </ResultSection>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section className="py-1">
      <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </p>
      <div className="flex flex-col gap-0.5">{children}</div>
    </section>
  );
}

function ChannelRow({
  channel,
  active,
  onSelect,
}: {
  channel: SearchChannel;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
        active ? "bg-active" : "hover:bg-hover"
      }`}
    >
      <span
        className="h-3.5 w-3.5 shrink-0 rounded-[5px]"
        style={{ backgroundColor: channelColor(channel) }}
      />
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
        <span className="text-muted">#</span> {channel.name}
      </span>
    </button>
  );
}

function NoteRow({
  note,
  channelName,
  active,
  onSelect,
}: {
  note: SearchNote;
  channelName: string;
  active: boolean;
  onSelect: () => void;
}) {
  const snippet = buildSnippet(note.snippetText, note.terms);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex w-full gap-3 rounded-xl px-3 py-2 text-left transition-colors ${
        active ? "bg-active" : "hover:bg-hover"
      }`}
    >
      <IconHash className="mt-1 h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex min-w-0 items-center gap-2">
          <span className="max-w-40 truncate rounded-md bg-hover px-2 py-0.5 text-[11px] font-medium text-muted">
            <span className="opacity-60">#</span> {channelName}
          </span>
          <span className="shrink-0 text-[11px] text-muted">
            {formatRelativeTime(note.createdAt)}
          </span>
        </div>
        <p className="line-clamp-2 text-sm leading-5 text-ink">
          {snippet.prefix && <span className="text-muted">…</span>}
          {snippet.parts.map((part, index) =>
            part.match ? (
              <mark
                key={index}
                className="rounded bg-active px-0.5 font-semibold text-accent"
              >
                {part.text}
              </mark>
            ) : (
              <span key={index}>{part.text}</span>
            ),
          )}
          {snippet.suffix && <span className="text-muted">…</span>}
        </p>
      </div>
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="px-3 py-8 text-center text-sm text-muted">{text}</p>;
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 24 * 60 * 60_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}
