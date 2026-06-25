import type { ChannelDoc } from "@aside/shared";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import IconEdit from "~icons/lucide/pencil";
import IconKey from "~icons/lucide/key-round";
import IconPlus from "~icons/lucide/plus";
import IconRefresh from "~icons/lucide/refresh-cw";
import IconTrash from "~icons/lucide/trash-2";
import type { ChannelCollection } from "../../db/database";
import {
  createFeed,
  deleteFeed,
  listFeeds,
  listSourceTypes,
  refreshFeed,
  setCookies,
  updateFeed,
  type Feed,
  type FeedStatus,
} from "./api";
import { resolveFeedChannelTarget, sortChannels } from "./channelTarget";

interface Props {
  channels: ChannelCollection;
  onFeedsChanged?: () => Promise<void>;
}

interface FeedDraft {
  channelName: string;
  cron: string;
  maxItems: string;
  url: string;
  cookies: string;
}

const DEFAULT_CRON = "0 * * * *";
const DEFAULT_MAX_ITEMS = "200";

/**
 * Feeds manager: create/edit feeds, seed X cookies, and trigger manual refresh.
 * Feed config stays server-only; imported notes still arrive via message sync.
 */
export function FeedSettings({ channels, onFeedsChanged }: Props) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [channelDocs, setChannelDocs] = useState<ChannelDoc[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [type, setType] = useState("");
  const [draft, setDraft] = useState<FeedDraft>(emptyDraft());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<FeedDraft>(emptyDraft());

  const [cookiesFor, setCookiesFor] = useState<string | null>(null);
  const [cookiesText, setCookiesText] = useState("");

  const reload = useCallback(async () => {
    setError(null);
    try {
      setFeeds(await listFeeds());
    } catch (err) {
      setError(message(err));
    }
  }, []);

  const reloadAll = useCallback(async () => {
    await reload();
    await onFeedsChanged?.();
  }, [onFeedsChanged, reload]);

  useEffect(() => {
    void reload();
    listSourceTypes()
      .then((types) => {
        setSourceTypes(types);
        setType((current) => current || types[0] || "");
      })
      .catch(() => undefined);
  }, [reload]);

  useEffect(() => {
    const sub = channels.find().$.subscribe((docs) => {
      setChannelDocs(
        sortChannels(
          docs.map((doc) => ({
            id: doc.id,
            name: doc.name,
            description: doc.description,
            createdAt: doc.createdAt,
            updatedAt: doc.updatedAt,
          })),
        ),
      );
    });
    return () => sub.unsubscribe();
  }, [channels]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!type) return;
    setError(null);

    try {
      const input = toFeedInput(type, draft, channelDocs);
      if (!input) {
        setError("Choose a channel name.");
        return;
      }
      const cookies = parseOptionalCookies(type, draft.cookies);
      const feed = await createFeed({ type, ...input });
      if (cookies) await setCookies(feed.id, cookies);
      setDraft(emptyDraft());
      await reloadAll();
    } catch (err) {
      setError(message(err));
    }
  }

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusyId(id);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusyId(null);
      await reloadAll();
    }
  }

  function onRefresh(feed: Feed) {
    return withBusy(feed.id, async () => {
      const result = await refreshFeed(feed.id);
      if (result.status === "error") {
        setError(result.error ?? "Refresh failed.");
      }
    });
  }

  function onToggle(feed: Feed) {
    return withBusy(feed.id, () =>
      updateFeed(feed.id, { enabled: !feed.enabled }).then(() => undefined),
    );
  }

  function onDelete(feed: Feed) {
    return withBusy(feed.id, () => deleteFeed(feed.id).then(() => undefined));
  }

  async function onSaveCookies(feed: Feed) {
    const parsed = parseCookies(cookiesText);
    await withBusy(feed.id, async () => {
      await setCookies(feed.id, parsed);
      setCookiesFor(null);
      setCookiesText("");
    });
  }

  function beginEdit(feed: Feed) {
    setEditingId(feed.id);
    setEditDraft(draftFromFeed(feed));
    setCookiesFor(null);
  }

  async function onSaveEdit(feed: Feed) {
    await withBusy(feed.id, async () => {
      const input = toFeedInput(feed.type, editDraft, channelDocs);
      if (!input) throw new Error("Choose a channel name.");
      await updateFeed(feed.id, input);
      setEditingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {feeds.map((feed) => {
          const busy = busyId === feed.id;
          const editing = editingId === feed.id;
          return (
            <li
              key={feed.id}
              className="rounded border border-divider bg-sidebar p-3"
            >
              {editing ? (
                <FeedFormFields
                  type={feed.type}
                  draft={editDraft}
                  channels={channelDocs}
                  busy={busy}
                  listId={`aside-feed-channels-${feed.id}`}
                  onDraft={setEditDraft}
                  actions={
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEditingId(null)}
                        className="rounded px-3 py-1.5 text-xs text-muted hover:bg-hover hover:text-ink"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onSaveEdit(feed)}
                        className="rounded bg-accent px-3 py-1.5 text-xs text-white hover:opacity-90 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </>
                  }
                />
              ) : (
                <>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">
                        <span className="text-muted">#</span>
                        {feed.channelName}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {feed.type} · <code>{feed.cron}</code> ·{" "}
                        {feedSummary(feed)} · last run{" "}
                        {formatTime(feed.lastRunAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                      <StatusBadge
                        status={feed.lastStatus}
                        error={feed.lastError}
                      />
                      <div className="flex items-center gap-1">
                        <IconButton
                          label="Refresh now"
                          disabled={busy}
                          onClick={() => void onRefresh(feed)}
                        >
                          <IconRefresh
                            className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
                          />
                        </IconButton>
                        {feed.type === "twitter-bookmarks" && (
                          <IconButton
                            label="Log in / update session"
                            disabled={busy}
                            onClick={() =>
                              setCookiesFor((cur) =>
                                cur === feed.id ? null : feed.id,
                              )
                            }
                          >
                            <IconKey className="h-4 w-4" />
                          </IconButton>
                        )}
                        <IconButton
                          label="Edit feed"
                          disabled={busy}
                          onClick={() => beginEdit(feed)}
                        >
                          <IconEdit className="h-4 w-4" />
                        </IconButton>
                        <IconButton
                          label="Delete feed"
                          disabled={busy}
                          danger
                          onClick={() => void onDelete(feed)}
                        >
                          <IconTrash className="h-4 w-4" />
                        </IconButton>
                      </div>
                    </div>
                  </div>

                  <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={feed.enabled}
                      disabled={busy}
                      onChange={() => void onToggle(feed)}
                    />
                    Scheduled (runs on its cron when enabled)
                  </label>
                </>
              )}

              {cookiesFor === feed.id && (
                <div className="mt-3 border-t border-divider pt-3">
                  <p className="mb-1 text-xs text-muted">
                    Paste the cookie JSON exported from x.com. Stored
                    server-side and seeded into this feed's browser session.
                  </p>
                  <textarea
                    value={cookiesText}
                    onChange={(e) => setCookiesText(e.target.value)}
                    rows={4}
                    placeholder='[{"name":"auth_token","value":"...","domain":".x.com"}, ...]'
                    className="w-full rounded bg-rail px-2 py-1.5 font-mono text-xs text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
                  />
                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCookiesFor(null);
                        setCookiesText("");
                      }}
                      className="rounded px-3 py-1 text-xs text-muted hover:bg-hover hover:text-ink"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={busy || !cookiesText.trim()}
                      onClick={() => void onSaveCookies(feed)}
                      className="rounded bg-accent px-3 py-1 text-xs text-white hover:opacity-90 disabled:opacity-50"
                    >
                      Save session
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {feeds.length === 0 && (
          <li className="rounded border border-dashed border-divider px-3 py-6 text-center text-sm text-muted">
            No feeds yet. Add one below.
          </li>
        )}
      </ul>

      <form
        onSubmit={onCreate}
        className="flex flex-col gap-2 border-t border-divider pt-4"
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Add feed
        </p>
        <div className="flex flex-wrap gap-2">
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded bg-rail px-2 py-1.5 text-sm text-ink outline-none focus:ring-1 focus:ring-accent"
          >
            {sourceTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="ml-auto flex shrink-0 items-center gap-1 rounded bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            <IconPlus className="h-4 w-4" />
            Add
          </button>
        </div>
        <FeedFormFields
          type={type}
          draft={draft}
          channels={channelDocs}
          listId="aside-feed-channels-create"
          onDraft={setDraft}
        />
      </form>
    </div>
  );
}

function FeedFormFields({
  type,
  draft,
  channels,
  listId,
  busy = false,
  actions,
  onDraft,
}: {
  type: string;
  draft: FeedDraft;
  channels: ChannelDoc[];
  listId: string;
  busy?: boolean;
  actions?: React.ReactNode;
  onDraft: (draft: FeedDraft) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <input
          value={draft.channelName}
          disabled={busy}
          onChange={(e) => onDraft({ ...draft, channelName: e.target.value })}
          placeholder="channel name"
          list={listId}
          className="min-w-0 flex-1 rounded bg-rail px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
        <datalist id={listId}>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.name} />
          ))}
        </datalist>
        <input
          value={draft.cron}
          disabled={busy}
          onChange={(e) => onDraft({ ...draft, cron: e.target.value })}
          placeholder="cron (e.g. 0 * * * *)"
          className="min-w-0 flex-1 rounded bg-rail px-2 py-1.5 font-mono text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
        <input
          value={draft.maxItems}
          disabled={busy}
          onChange={(e) => onDraft({ ...draft, maxItems: e.target.value })}
          inputMode="numeric"
          placeholder="max items"
          className="w-28 rounded bg-rail px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
      </div>
      {type === "rss" && (
        <input
          value={draft.url}
          disabled={busy}
          onChange={(e) => onDraft({ ...draft, url: e.target.value })}
          placeholder="RSS feed URL"
          className="rounded bg-rail px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
      )}
      {type === "twitter-bookmarks" && !actions && (
        <textarea
          value={draft.cookies}
          onChange={(e) => onDraft({ ...draft, cookies: e.target.value })}
          rows={3}
          placeholder='optional cookie JSON: [{"name":"auth_token","value":"...","domain":".x.com"}, ...]'
          className="w-full rounded bg-rail px-2 py-1.5 font-mono text-xs text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
        />
      )}
      {actions && <div className="flex justify-end gap-2">{actions}</div>}
    </div>
  );
}

function IconButton(props: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
      className={`rounded p-1.5 text-muted hover:bg-hover disabled:opacity-50 ${
        props.danger ? "hover:text-danger" : "hover:text-ink"
      }`}
    >
      {props.children}
    </button>
  );
}

function StatusBadge({
  status,
  error,
}: {
  status: FeedStatus | null;
  error: string | null;
}) {
  const map: Record<FeedStatus, { label: string; cls: string }> = {
    ok: { label: "ok", cls: "bg-emerald-500/10 text-emerald-600" },
    running: { label: "running", cls: "bg-amber-500/10 text-amber-600" },
    auth_required: {
      label: "needs login",
      cls: "bg-orange-500/10 text-orange-600",
    },
    error: { label: "error", cls: "bg-red-500/10 text-red-600" },
  };
  const view = status
    ? map[status]
    : { label: "never run", cls: "bg-hover text-muted" };
  return (
    <span
      title={error ?? undefined}
      className={`rounded px-2 py-1 text-[11px] font-medium ${view.cls}`}
    >
      {view.label}
    </span>
  );
}

function toFeedInput(type: string, draft: FeedDraft, channels: ChannelDoc[]) {
  const target = resolveFeedChannelTarget(draft.channelName, channels);
  if (!target) return null;
  const options = feedOptions(type, draft);
  return {
    ...target,
    cron: draft.cron.trim() || DEFAULT_CRON,
    options,
  };
}

function feedOptions(type: string, draft: FeedDraft): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  const max = Number.parseInt(draft.maxItems, 10);
  if (Number.isFinite(max)) options.maxItems = max;
  if (type === "rss") {
    const url = draft.url.trim();
    if (!url) throw new Error("RSS feed URL is required.");
    options.url = url;
  }
  return options;
}

function parseOptionalCookies(type: string, raw: string): unknown[] | null {
  if (type !== "twitter-bookmarks" || !raw.trim()) return null;
  return parseCookies(raw);
}

function parseCookies(raw: string): unknown[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // handled below
  }
  throw new Error(
    "Cookies must be valid JSON (the array your extension exports).",
  );
}

function draftFromFeed(feed: Feed): FeedDraft {
  return {
    channelName: feed.channelName,
    cron: feed.cron,
    maxItems:
      typeof feed.options.maxItems === "number"
        ? String(feed.options.maxItems)
        : DEFAULT_MAX_ITEMS,
    url: typeof feed.options.url === "string" ? feed.options.url : "",
    cookies: "",
  };
}

function emptyDraft(): FeedDraft {
  return {
    channelName: "",
    cron: DEFAULT_CRON,
    maxItems: DEFAULT_MAX_ITEMS,
    url: "",
    cookies: "",
  };
}

function feedSummary(feed: Feed): string {
  if (feed.type === "rss" && typeof feed.options.url === "string") {
    return feed.options.url;
  }
  const max =
    typeof feed.options.maxItems === "number"
      ? feed.options.maxItems
      : DEFAULT_MAX_ITEMS;
  return `${max} max`;
}

function formatTime(ts: number | null): string {
  if (!ts) return "never";
  return new Date(ts).toLocaleString();
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
