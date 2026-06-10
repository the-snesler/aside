import { DEFAULT_CHANNEL_ID, type MessageDoc } from "@aside/shared";
import { useEffect, useMemo, useState } from "react";
import type { RxDocument } from "rxdb";
import IconCopy from "~icons/lucide/copy";
import IconInbox from "~icons/lucide/inbox";
import IconPencil from "~icons/lucide/pencil";
import IconTrash from "~icons/lucide/trash-2";
import type { ChannelCollection, MessageCollection } from "../../db/database";
import { parseChannelTag, stripChannelTag } from "../channels/channelName";
import { HOME_ID } from "../channels/home";
import { Markdown } from "./Markdown";
import { MarkdownEditor } from "./MarkdownEditor";

interface Props {
  messages: MessageCollection;
  channels: ChannelCollection;
  channelId: string;
}

export function MessageList({ messages, channels, channelId }: Props) {
  const isHome = channelId === HOME_ID;
  const [docs, setDocs] = useState<RxDocument<MessageDoc>[]>([]);
  const [channelNames, setChannelNames] = useState<Map<string, string>>(
    new Map(),
  );
  // Bumped after each successful send to remount (and so clear + refocus) the
  // composer editor, which owns its own draft.
  const [composerKey, setComposerKey] = useState(0);
  // EDIT-1: which row is open for editing.
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    // Load all, then filter (Home shows every channel) + sort in JS. Matches the
    // existing approach; a sort index is UI-3's concern.
    const sub = messages.find().$.subscribe((found) => {
      const scoped = isHome
        ? [...found]
        : found.filter((doc) => doc.channelId === channelId);
      setDocs(scoped.sort((a, b) => a.createdAt - b.createdAt));
    });
    return () => sub.unsubscribe();
  }, [messages, channelId, isHome]);

  useEffect(() => {
    // id → name map: drives both the header and the per-note channel badge shown
    // in Home.
    const sub = channels.find().$.subscribe((found) => {
      setChannelNames(new Map(found.map((c) => [c.id, c.name])));
    });
    return () => sub.unsubscribe();
  }, [channels]);

  const groups = useMemo(() => groupByDay(docs), [docs]);
  const headerName = isHome
    ? "Home"
    : (channelNames.get(channelId) ?? channelId);

  async function handleSend(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;

    // CH-4: a #tag files the note in an existing channel of that name and is
    // stripped from the saved text. With no match the note stays in the current
    // view (or #general from Home) and the tag is kept as plain text.
    let targetChannelId = isHome ? DEFAULT_CHANNEL_ID : channelId;
    let body = trimmed;
    const tag = parseChannelTag(trimmed);
    if (tag) {
      const tagged = await channels.findOne({ selector: { name: tag } }).exec();
      if (tagged) {
        targetChannelId = tagged.id;
        body = stripChannelTag(trimmed, tag);
      }
    }
    if (!body) return; // the message was only the tag — nothing to save

    const now = Date.now();
    await messages.insert({
      id: crypto.randomUUID(),
      channelId: targetChannelId,
      text: body,
      createdAt: now,
      updatedAt: now,
    });
    // Remount the composer to clear it and put the caret back.
    setComposerKey((k) => k + 1);
  }

  async function copyMessage(doc: RxDocument<MessageDoc>) {
    await navigator.clipboard.writeText(doc.text);
  }

  async function deleteMessage(doc: RxDocument<MessageDoc>) {
    // Bump updatedAt so the soft-delete wins timestamp-based conflict handling,
    // then remove() the returned (new-revision) doc — not the stale reference.
    const bumped = await doc.incrementalPatch({ updatedAt: Date.now() });
    await bumped.remove();
  }

  function startEdit(doc: RxDocument<MessageDoc>) {
    setEditingId(doc.id);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(doc: RxDocument<MessageDoc>, raw: string) {
    // EDIT-1: write text + a fresh updatedAt through the normal replication
    // path; the bumped timestamp makes the edit win LWW conflict resolution.
    // Empty or unchanged is a no-op (delete has its own button).
    const trimmed = raw.trim();
    if (!trimmed || trimmed === doc.text) {
      cancelEdit();
      return;
    }
    await doc.incrementalPatch({ text: trimmed, updatedAt: Date.now() });
    cancelEdit();
  }

  return (
    <main className="flex h-full min-h-0 flex-col bg-chat">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-divider px-4 font-semibold shadow-sm">
        {isHome ? (
          <>
            <IconInbox className="h-4 w-4 text-muted" />
            Home
          </>
        ) : (
          <>
            <span className="text-muted">#</span> {headerName}
          </>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {groups.length === 0 && (
          <p className="text-muted">
            {isHome ? "No notes yet." : "No notes in this channel yet."}
          </p>
        )}
        {groups.map((group) => (
          <section key={group.key}>
            <div className="my-3 flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-divider" />
              <span className="font-medium">{group.label}</span>
              <span className="h-px flex-1 bg-divider" />
            </div>
            <ul className="flex flex-col">
              {group.docs.map((doc) => {
                const isEditing = editingId === doc.id;
                return (
                  <li
                    key={doc.id}
                    className="group relative flex gap-3 rounded px-2 py-1 hover:bg-hover"
                  >
                    <span className="w-12 shrink-0 pt-0.5 text-right text-xs text-muted">
                      {formatTime(doc.createdAt)}
                    </span>
                    {isHome && (
                      <span className="mt-px shrink-0 self-start rounded bg-active px-1.5 py-0.5 text-[11px] text-muted">
                        #{channelNames.get(doc.channelId) ?? "unknown"}
                      </span>
                    )}
                    {isEditing ? (
                      <div className="min-w-0 flex-1">
                        <MarkdownEditor
                          key={doc.id}
                          initialValue={doc.text}
                          autoFocus
                          onSubmit={(t) => void saveEdit(doc, t)}
                          onCancel={cancelEdit}
                          className="max-h-[50vh] w-full overflow-y-auto rounded-lg bg-rail px-3 py-2 text-ink outline-none focus:ring-1 focus:ring-accent"
                        />
                        <div className="mt-1 text-xs text-muted">
                          escape to{" "}
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="text-accent hover:underline"
                          >
                            cancel
                          </button>{" "}
                          • enter to save • shift+enter for newline
                        </div>
                      </div>
                    ) : (
                      <Markdown
                        text={doc.text}
                        className="min-w-0 flex-1 break-words text-ink"
                      />
                    )}
                    {!isEditing && (
                      <span className="absolute right-2 top-0 hidden -translate-y-1/2 items-center gap-1 rounded bg-rail px-1 py-0.5 shadow group-hover:flex">
                        <button
                          type="button"
                          onClick={() => startEdit(doc)}
                          aria-label="Edit"
                          className="rounded p-1 text-muted hover:text-ink"
                        >
                          <IconPencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void copyMessage(doc)}
                          aria-label="Copy"
                          className="rounded p-1 text-muted hover:text-ink"
                        >
                          <IconCopy className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteMessage(doc)}
                          aria-label="Delete"
                          className="rounded p-1 text-muted hover:text-danger"
                        >
                          <IconTrash className="h-4 w-4" />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="shrink-0 px-4 pb-4">
        <MarkdownEditor
          key={composerKey}
          initialValue=""
          autoFocus
          placeholder={isHome ? "Jot a note…" : `Message #${headerName}`}
          onSubmit={(t) => void handleSend(t)}
          className="max-h-[50vh] w-full overflow-y-auto rounded-lg bg-rail px-4 py-3 text-ink outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
    </main>
  );
}

interface DayGroup {
  key: string;
  label: string;
  docs: RxDocument<MessageDoc>[];
}

/** Splits a chronologically-sorted list into contiguous per-calendar-day groups. */
function groupByDay(docs: RxDocument<MessageDoc>[]): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const doc of docs) {
    const date = new Date(doc.createdAt);
    const key = date.toDateString();
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.docs.push(doc);
    } else {
      groups.push({ key, label: formatDayLabel(date), docs: [doc] });
    }
  }
  return groups;
}

function formatDayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}
