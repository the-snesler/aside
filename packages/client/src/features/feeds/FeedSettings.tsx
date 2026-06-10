import { useCallback, useEffect, useState } from "react";
import IconKey from "~icons/lucide/key-round";
import IconPlus from "~icons/lucide/plus";
import IconRefresh from "~icons/lucide/refresh-cw";
import IconTrash from "~icons/lucide/trash-2";
import IconX from "~icons/lucide/x";
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

interface Props {
  open: boolean;
  onClose: () => void;
  channels: ChannelCollection;
}

const DEFAULT_CRON = "0 * * * *";

/**
 * Feeds manager: create/enable/delete feeds, paste the X session cookies, and
 * trigger a manual refresh. Talks to the `/api/feeds*` endpoints over fetch; the
 * notes a feed pulls in arrive in their channel via the usual sync stream.
 */
export function FeedSettings({ open, onClose, channels }: Props) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [channelNames, setChannelNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [type, setType] = useState("");
  const [channelName, setChannelName] = useState("");
  const [cron, setCron] = useState(DEFAULT_CRON);
  const [maxItems, setMaxItems] = useState("200");

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

  useEffect(() => {
    if (!open) return;
    void reload();
    listSourceTypes()
      .then((types) => {
        setSourceTypes(types);
        setType((current) => current || types[0] || "");
      })
      .catch(() => undefined);
  }, [open, reload]);

  useEffect(() => {
    const sub = channels
      .find()
      .$.subscribe((docs) => setChannelNames(docs.map((d) => d.name)));
    return () => sub.unsubscribe();
  }, [channels]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!type || !channelName.trim()) return;
    setError(null);
    try {
      const max = Number.parseInt(maxItems, 10);
      await createFeed({
        type,
        channelName: channelName.trim(),
        cron: cron.trim() || DEFAULT_CRON,
        options: Number.isFinite(max) ? { maxItems: max } : {},
      });
      setChannelName("");
      await reload();
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
      await reload();
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
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cookiesText);
    } catch {
      setError(
        "Cookies must be valid JSON (the array your extension exports).",
      );
      return;
    }
    await withBusy(feed.id, async () => {
      await setCookies(feed.id, parsed);
      setCookiesFor(null);
      setCookiesText("");
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-[min(640px,92vw)] flex-col overflow-hidden rounded-lg border border-divider bg-chat shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-divider px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Feeds</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-muted hover:bg-hover hover:text-ink"
          >
            <IconX className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {error && (
            <p className="mb-3 rounded bg-danger/10 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          <ul className="flex flex-col gap-2">
            {feeds.map((feed) => {
              const busy = busyId === feed.id;
              return (
                <li
                  key={feed.id}
                  className="rounded border border-divider bg-sidebar p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">
                        <span className="text-muted">#</span>
                        {feed.channelName}
                      </p>
                      <p className="truncate text-xs text-muted">
                        {feed.type} · <code>{feed.cron}</code> · last run{" "}
                        {formatTime(feed.lastRunAt)}
                      </p>
                    </div>
                    <StatusBadge
                      status={feed.lastStatus}
                      error={feed.lastError}
                    />
                    <div className="flex shrink-0 items-center gap-1">
                      <IconButton
                        label="Refresh now"
                        disabled={busy}
                        onClick={() => void onRefresh(feed)}
                      >
                        <IconRefresh
                          className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
                        />
                      </IconButton>
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

                  <label className="mt-2 flex items-center gap-2 text-xs text-muted">
                    <input
                      type="checkbox"
                      checked={feed.enabled}
                      disabled={busy}
                      onChange={() => void onToggle(feed)}
                    />
                    Scheduled (runs on its cron when enabled)
                  </label>

                  {cookiesFor === feed.id && (
                    <div className="mt-3 border-t border-divider pt-3">
                      <p className="mb-1 text-xs text-muted">
                        Paste the cookie JSON exported from x.com (e.g. the “Get
                        cookies.txt LOCALLY” extension). Stored server-side and
                        seeded into this feed’s browser session.
                      </p>
                      <textarea
                        value={cookiesText}
                        onChange={(e) => setCookiesText(e.target.value)}
                        rows={4}
                        placeholder='[{"name":"auth_token","value":"…","domain":".x.com"}, …]'
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
            className="mt-4 flex flex-col gap-2 border-t border-divider pt-4"
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
              <input
                value={channelName}
                onChange={(e) => setChannelName(e.target.value)}
                placeholder="channel name"
                list="aside-feed-channels"
                className="min-w-0 flex-1 rounded bg-rail px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
              />
              <datalist id="aside-feed-channels">
                {channelNames.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                value={cron}
                onChange={(e) => setCron(e.target.value)}
                placeholder="cron (e.g. 0 * * * *)"
                className="min-w-0 flex-1 rounded bg-rail px-2 py-1.5 font-mono text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
              />
              <input
                value={maxItems}
                onChange={(e) => setMaxItems(e.target.value)}
                inputMode="numeric"
                placeholder="max items"
                className="w-28 rounded bg-rail px-2 py-1.5 text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
              />
              <button
                type="submit"
                className="flex shrink-0 items-center gap-1 rounded bg-accent px-3 py-1.5 text-sm text-white hover:opacity-90"
              >
                <IconPlus className="h-4 w-4" />
                Add
              </button>
            </div>
          </form>
        </div>
      </div>
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
    ok: { label: "ok", cls: "text-emerald-400 bg-emerald-500/10" },
    running: { label: "running", cls: "text-amber-400 bg-amber-500/10" },
    auth_required: {
      label: "needs login",
      cls: "text-orange-400 bg-orange-500/10",
    },
    error: { label: "error", cls: "text-red-400 bg-red-500/10" },
  };
  const view = status
    ? map[status]
    : { label: "never run", cls: "text-muted bg-hover" };
  return (
    <span
      title={error ?? undefined}
      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${view.cls}`}
    >
      {view.label}
    </span>
  );
}

function formatTime(ts: number | null): string {
  return ts ? new Date(ts).toLocaleString() : "never";
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
