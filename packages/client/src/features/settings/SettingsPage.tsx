import type { AttachmentDoc } from "@aside/shared";
import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { RxDocument } from "rxdb";
import { changePassword } from "../../auth";
import type {
  AttachmentCollection,
  ChannelCollection,
  ConfigCollection,
} from "../../db/database";
import { useDisplay, type DisplaySettings } from "../../appearance";
import { useIsDemo } from "../../demo";
import { blobUrl, thumbUrl } from "../attachments/api";
import { useLightbox } from "../lightbox/LightboxProvider";
import {
  deleteAttachments,
  getStorageUsage,
  type BlobCategory,
  type StorageUsage,
} from "../storage/api";
import { formatSize } from "../storage/format";
import {
  applyTheme,
  DEFAULT_THEME,
  HEX_TOKENS,
  saveThemePalette,
  THEME_PRESETS,
  TOKEN_LABELS,
  useThemePalette,
  type ThemePalette,
} from "../../theme";
import { AiSettings } from "../ai/AiSettings";
import { FeedSettings } from "../feeds/FeedSettings";
import { Segmented } from "./Segmented";
import { ThemeStudio } from "./ThemeStudio";
import {
  currentPushEndpoint,
  disablePushNotifications,
  enablePushNotifications,
  getNotificationStatus,
} from "../notifications/api";
import IconBell from "~icons/lucide/bell";
import IconDatabase from "~icons/lucide/database";
import IconFile from "~icons/lucide/file";
import IconLock from "~icons/lucide/lock-keyhole";
import IconMenu from "~icons/lucide/menu";
import IconPalette from "~icons/lucide/palette";
import IconRss from "~icons/lucide/rss";
import IconSettings from "~icons/lucide/settings";
import IconSparkles from "~icons/lucide/sparkles";
import IconTrash from "~icons/lucide/trash-2";

type SectionId =
  | "ai"
  | "feeds"
  | "appearance"
  | "storage"
  | "notifications"
  | "security";

interface Props {
  channels: ChannelCollection;
  config: ConfigCollection;
  attachments: AttachmentCollection;
  onOpenMenu: () => void;
  onFeedsChanged?: () => Promise<void>;
}

const sections: Array<{
  id: SectionId;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: "ai",
    title: "Ambient AI",
    description:
      "Background bots that auto-organize notes and describe channels.",
    icon: <IconSparkles className="h-5 w-5" />,
  },
  {
    id: "feeds",
    title: "Feeds",
    description: "Sources, schedules, sessions, and refresh status.",
    icon: <IconRss className="h-5 w-5" />,
  },
  {
    id: "appearance",
    title: "Appearance",
    description: "Theme, density, and display preferences.",
    icon: <IconPalette className="h-5 w-5" />,
  },
  {
    id: "storage",
    title: "Storage",
    description: "Local database, sync status, and attachment cache.",
    icon: <IconDatabase className="h-5 w-5" />,
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Device alerts and install-time permissions.",
    icon: <IconBell className="h-5 w-5" />,
  },
  {
    id: "security",
    title: "Security",
    description: "Password and session protection.",
    icon: <IconLock className="h-5 w-5" />,
  },
];

export function SettingsPage({
  channels,
  config,
  attachments,
  onOpenMenu,
  onFeedsChanged,
}: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>("ai");
  const current = sections.find((section) => section.id === activeSection)!;
  const isDemo = useIsDemo();

  return (
    <main className="relative z-10 flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-chat md:-ml-5 md:rounded-[28px] md:shadow-xl md:ring-1 md:ring-black/5">
      <header className="flex h-14 shrink-0 items-center gap-2.5 px-4 md:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open sidebar"
          className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink md:hidden"
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <IconSettings className="hidden h-5 w-5 text-accent md:block" />
        <h1 className="text-lg font-semibold text-ink">Settings</h1>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 overflow-hidden border-t border-divider md:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="border-b border-divider bg-panel/60 p-3 md:border-b-0 md:border-r">
          <nav className="flex gap-2 overflow-x-auto md:flex-col md:overflow-visible">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                className={`flex min-w-[180px] items-start gap-3 rounded-lg px-3 py-3 text-left transition md:min-w-0 ${
                  section.id === activeSection
                    ? "bg-active text-ink"
                    : "text-muted hover:bg-hover hover:text-ink"
                }`}
              >
                <span className="mt-0.5 shrink-0 text-accent">
                  {section.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">
                    {section.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted">
                    {section.description}
                  </span>
                </span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="min-h-0 overflow-y-auto px-4 py-5 md:px-8">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
            <div>
              <div className="flex items-center gap-2 text-accent">
                {current.icon}
                <h2 className="text-lg font-semibold text-ink">
                  {current.title}
                </h2>
              </div>
              <p className="mt-1 text-sm text-muted">{current.description}</p>
            </div>

            {activeSection === "ai" &&
              (isDemo ? <DemoDisabledNotice /> : <AiSettings />)}
            {activeSection === "feeds" &&
              (isDemo ? (
                <DemoDisabledNotice />
              ) : (
                <FeedSettings
                  channels={channels}
                  onFeedsChanged={onFeedsChanged}
                />
              ))}
            {activeSection === "appearance" && (
              <AppearanceSettings config={config} />
            )}
            {activeSection === "storage" && (
              <StorageSettings attachments={attachments} />
            )}
            {activeSection === "notifications" && <NotificationSettings />}
            {activeSection === "security" &&
              (isDemo ? <DemoDisabledNotice /> : <SecuritySettings />)}
          </div>
        </section>
      </div>
    </main>
  );
}

/** Placeholder shown for settings sections that are turned off in the demo. */
function DemoDisabledNotice() {
  return (
    <div className="rounded-lg border border-divider bg-panel p-4 text-sm text-muted">
      This section is disabled in the public demo.
    </div>
  );
}

function AppearanceSettings({ config }: { config: ConfigCollection }) {
  const palette = useThemePalette(config);
  const [display, updateDisplay] = useDisplay();

  // Persist the whole palette with one token overridden. Used by the accent
  // picker and the advanced per-token editor.
  function setToken(key: string, value: string) {
    void saveThemePalette(config, { ...palette, [key]: value });
  }

  const activePreset = THEME_PRESETS.find(
    (preset) => JSON.stringify(preset.palette) === JSON.stringify(palette),
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Theme presets */}
      <div className="rounded-lg border border-divider bg-panel p-4">
        <h3 className="text-sm font-semibold text-ink">Theme</h3>
        <p className="mt-1 text-sm text-muted">
          Pick a preset, or build your own below. Themes sync to every device.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {THEME_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => void saveThemePalette(config, preset.palette)}
              className={`flex flex-col gap-2 rounded-lg border p-2 text-left transition hover:border-accent ${
                activePreset?.id === preset.id
                  ? "border-accent ring-1 ring-accent"
                  : "border-divider"
              }`}
            >
              <PresetSwatch palette={preset.palette} />
              <span className="text-xs font-medium text-ink">
                {preset.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom theme picker */}
      <ThemeStudio config={config} palette={palette} />

      {/* Advanced per-token editor */}
      <details className="rounded-lg border border-divider bg-panel p-4">
        <summary className="cursor-pointer text-sm font-semibold text-ink">
          Advanced colors
        </summary>
        <p className="mt-1 text-sm text-muted">
          Edit individual palette tokens. Overlay tokens (hover, dividers)
          follow the preset and reset.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {HEX_TOKENS.map((key) => (
            <label
              key={key}
              className="flex items-center gap-2 text-sm text-ink"
            >
              <input
                type="color"
                value={palette[key]}
                onInput={(e) =>
                  applyTheme({ ...palette, [key]: e.currentTarget.value })
                }
                onChange={(e) => setToken(key, e.currentTarget.value)}
                className="h-7 w-9 shrink-0 cursor-pointer rounded border border-divider bg-rail"
              />
              <span className="min-w-0 truncate">
                {TOKEN_LABELS[key] ?? key}
              </span>
            </label>
          ))}
        </div>
      </details>

      <div>
        <button
          type="button"
          onClick={() => void saveThemePalette(config, DEFAULT_THEME)}
          className="rounded border border-divider bg-sidebar px-3 py-2 text-sm font-medium text-ink hover:bg-hover"
        >
          Reset theme to default
        </button>
      </div>

      {/* Display preferences (per-device) */}
      <div className="rounded-lg border border-divider bg-panel p-4">
        <h3 className="text-sm font-semibold text-ink">Display</h3>
        <p className="mt-1 text-sm text-muted">
          These preferences are saved on this device only.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          <Segmented<DisplaySettings["density"]>
            label="Density"
            value={display.density}
            onChange={(density) => updateDisplay({ density })}
            options={[
              { value: "comfortable", label: "Comfortable" },
              { value: "compact", label: "Compact" },
            ]}
          />
          <Segmented<DisplaySettings["textSize"]>
            label="Text size"
            value={display.textSize}
            onChange={(textSize) => updateDisplay({ textSize })}
            options={[
              { value: "small", label: "Small" },
              { value: "default", label: "Default" },
              { value: "large", label: "Large" },
            ]}
          />
          <label className="flex items-start gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={display.reduceMotion}
              onChange={(e) =>
                updateDisplay({ reduceMotion: e.target.checked })
              }
              className="mt-1"
            />
            <span>
              <span className="font-medium">Reduce motion</span>
              <span className="mt-0.5 block text-xs text-muted">
                Disable transitions and animations.
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

/** A small color-strip preview of a palette for the preset tiles. */
function PresetSwatch({ palette }: { palette: ThemePalette }) {
  return (
    <span
      className="flex h-10 overflow-hidden rounded-md border border-divider"
      style={{ backgroundColor: palette.chat }}
    >
      <span className="w-1/4" style={{ backgroundColor: palette.grad1 }} />
      <span className="w-1/4" style={{ backgroundColor: palette.grad3 }} />
      <span className="flex-1" style={{ backgroundColor: palette.chat }} />
      <span className="w-1/4" style={{ backgroundColor: palette.accent }} />
    </span>
  );
}

const CATEGORY_LABELS: Record<BlobCategory, string> = {
  image: "Images",
  video: "Videos",
  pdf: "PDFs",
  other: "Other files",
};

const CATEGORY_COLOR: Record<BlobCategory, string> = {
  image: "#6366f1",
  video: "#a855f7",
  pdf: "#f59e0b",
  other: "#64748b",
};

function StorageSettings({
  attachments,
}: {
  attachments: AttachmentCollection;
}) {
  const lightbox = useLightbox();
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<RxDocument<AttachmentDoc>[]>([]);
  // Ids deleted this session, hidden until the sync stream drops them locally.
  const [removed, setRemoved] = useState<Set<string>>(() => new Set());
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const refreshUsage = useCallback(() => {
    getStorageUsage()
      .then(setUsage)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    refreshUsage();
  }, [refreshUsage]);

  useEffect(() => {
    const sub = attachments.find().$.subscribe((found) => setItems(found));
    return () => sub.unsubscribe();
  }, [attachments]);

  // Newest first; suppress rows we've just deleted until sync catches up.
  const visible = useMemo(
    () =>
      [...items]
        .filter((a) => !removed.has(a.id))
        .sort((a, b) => b.createdAt - a.createdAt),
    [items, removed],
  );

  const imageItems = useMemo(
    () => visible.filter((a) => a.mimeType.startsWith("image/")),
    [visible],
  );

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openImage(att: RxDocument<AttachmentDoc>) {
    const idx = imageItems.findIndex((a) => a.id === att.id);
    lightbox.open(
      imageItems.map((a) => ({
        src: blobUrl(a.blobHash),
        caption: a.fileName,
        downloadUrl: blobUrl(a.blobHash),
      })),
      idx < 0 ? 0 : idx,
    );
  }

  async function removeSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await deleteAttachments(ids);
      setRemoved((prev) => new Set([...prev, ...ids]));
      setSelected(new Set());
      setConfirming(false);
      refreshUsage();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const selectedCount = selected.size;
  const selectedBytes = visible
    .filter((a) => selected.has(a.id))
    .reduce((sum, a) => sum + a.size, 0);

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="rounded-lg border border-divider bg-panel p-4">
        <h3 className="text-sm font-semibold text-ink">Storage usage</h3>
        {usage ? (
          <UsageBreakdown usage={usage} />
        ) : (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        )}
      </div>

      <div className="rounded-lg border border-divider bg-panel p-4">
        <h3 className="text-sm font-semibold text-ink">Local data</h3>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted">Database</dt>
            <dd className="mt-1 font-mono text-ink">asidedb</dd>
          </div>
          <div>
            <dt className="text-muted">Sync model</dt>
            <dd className="mt-1 text-ink">Local-first RxDB replication</dd>
          </div>
          <div>
            <dt className="text-muted">Attachments</dt>
            <dd className="mt-1 text-ink">
              Server blob store, fetched on demand
            </dd>
          </div>
          <div>
            <dt className="text-muted">Logout behavior</dt>
            <dd className="mt-1 text-ink">Keeps local notes on this device</dd>
          </div>
        </dl>
      </div>

      <div className="rounded-lg border border-divider bg-panel p-4">
        <h3 className="text-sm font-semibold text-ink">Attachments</h3>
        <p className="mt-1 text-sm text-muted">
          {visible.length} file{visible.length === 1 ? "" : "s"} stored.
        </p>

        {visible.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No attachments stored.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
              {visible.map((a) => (
                <AttachmentTile
                  key={a.id}
                  att={a}
                  selected={selected.has(a.id)}
                  onToggle={() => toggle(a.id)}
                  onOpen={() => openImage(a)}
                />
              ))}
            </div>

            {selectedCount > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {confirming ? (
                  <>
                    <span className="text-sm text-ink">
                      Delete {selectedCount} file
                      {selectedCount === 1 ? "" : "s"} (
                      {formatSize(selectedBytes)}
                      )?
                    </span>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeSelected()}
                      className="rounded bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {busy ? "Deleting…" : "Confirm delete"}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                      className="rounded border border-divider px-3 py-2 text-sm text-ink hover:bg-hover"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    className="flex items-center gap-2 rounded bg-danger px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                  >
                    <IconTrash className="h-4 w-4" />
                    Delete {selectedCount} selected ({formatSize(selectedBytes)}
                    )
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** The stacked-bar + per-type breakdown of storage usage. */
function UsageBreakdown({ usage }: { usage: StorageUsage }) {
  const totalBytes = usage.blobs.total.bytes;
  const textBytes =
    usage.text.messages + usage.text.channels + usage.text.embeds;

  return (
    <div className="mt-3 flex flex-col gap-3">
      <div className="flex h-2 overflow-hidden rounded-full bg-rail">
        {usage.blobs.byCategory.map((c) =>
          c.bytes > 0 && totalBytes > 0 ? (
            <span
              key={c.category}
              style={{
                width: `${(c.bytes / totalBytes) * 100}%`,
                backgroundColor: CATEGORY_COLOR[c.category],
              }}
            />
          ) : null,
        )}
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        {usage.blobs.byCategory.map((c) => (
          <div
            key={c.category}
            className="flex items-center justify-between gap-2"
          >
            <dt className="flex items-center gap-2 text-muted">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: CATEGORY_COLOR[c.category] }}
              />
              {CATEGORY_LABELS[c.category]}
              <span className="text-xs">({c.count})</span>
            </dt>
            <dd className="text-ink">{formatSize(c.bytes)}</dd>
          </div>
        ))}
      </dl>

      <div className="flex items-center justify-between border-t border-divider pt-2 text-sm">
        <span className="font-medium text-ink">Attachments total</span>
        <span className="font-medium text-ink">
          {formatSize(totalBytes)} · {usage.blobs.total.count} file
          {usage.blobs.total.count === 1 ? "" : "s"}
        </span>
      </div>
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Text (notes, channels, links)</span>
        <span>{formatSize(textBytes)}</span>
      </div>
    </div>
  );
}

/** One selectable attachment in the storage grid. */
function AttachmentTile({
  att,
  selected,
  onToggle,
  onOpen,
}: {
  att: RxDocument<AttachmentDoc>;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const isImage = att.mimeType.startsWith("image/");
  return (
    <div
      className={`relative overflow-hidden rounded-lg border bg-rail ${
        selected ? "border-accent ring-1 ring-accent" : "border-divider"
      }`}
    >
      <label className="absolute left-2 top-2 z-10 flex cursor-pointer rounded bg-panel/80 p-0.5 shadow-sm">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          aria-label={`Select ${att.fileName}`}
          className="h-4 w-4 cursor-pointer accent-accent"
        />
      </label>

      {isImage ? (
        <button
          type="button"
          onClick={onOpen}
          className="block aspect-square w-full cursor-zoom-in"
        >
          <img
            src={thumbUrl(att.blobHash, 400)}
            alt={att.fileName}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        </button>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          className="flex aspect-square w-full flex-col items-center justify-center gap-2 text-muted"
        >
          <IconFile className="h-8 w-8" />
          <span className="px-2 text-center text-[11px] uppercase">
            {extension(att.fileName, att.mimeType)}
          </span>
        </button>
      )}

      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <span
          className="min-w-0 truncate text-xs text-ink"
          title={att.fileName}
        >
          {att.fileName}
        </span>
        <span className="shrink-0 text-[11px] text-muted">
          {formatSize(att.size)}
        </span>
      </div>
    </div>
  );
}

/** Best-effort file extension for the non-image tile label. */
function extension(fileName: string, mimeType: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot >= 0 && dot < fileName.length - 1) return fileName.slice(dot + 1);
  const slash = mimeType.indexOf("/");
  return slash >= 0 ? mimeType.slice(slash + 1) : "file";
}

function NotificationSettings() {
  const [permission, setPermission] = useState(() =>
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission,
  );
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const endpoint = await currentPushEndpoint();
        const status = await getNotificationStatus(endpoint);
        if (!cancelled) setSubscribed(status.subscribed);
      } catch {
        if (!cancelled) setSubscribed(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    try {
      const status = await enablePushNotifications();
      setPermission(Notification.permission);
      setSubscribed(status.subscribed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not subscribe.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setError(null);
    try {
      await disablePushNotifications();
      setSubscribed(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unsubscribe.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-divider bg-panel p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Browser permission</h3>
          <p className="mt-1 text-sm text-muted">
            Current permission:{" "}
            <span className="font-medium">{permission}</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            Push subscription:{" "}
            <span className="font-medium">
              {subscribed ? "enabled" : "disabled"}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={busy || permission === "unsupported" || subscribed}
            onClick={() => void enable()}
            className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Enable
          </button>
          <button
            type="button"
            disabled={busy || !subscribed}
            onClick={() => void disable()}
            className="rounded border border-divider bg-sidebar px-3 py-2 text-sm font-medium text-ink hover:bg-hover disabled:opacity-50"
          >
            Disable
          </button>
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}

function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [messageText, setMessageText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMessageText(null);
    setError(null);
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessageText("Password updated.");
    } catch {
      setError("Could not update password. Check the current password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-lg border border-divider bg-panel p-4"
    >
      <h3 className="text-sm font-semibold text-ink">Change password</h3>
      <PasswordField
        label="Current password"
        value={currentPassword}
        onChange={setCurrentPassword}
      />
      <PasswordField
        label="New password"
        value={newPassword}
        onChange={setNewPassword}
      />
      <PasswordField
        label="Confirm new password"
        value={confirmPassword}
        onChange={setConfirmPassword}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
      {messageText && <p className="text-sm text-muted">{messageText}</p>}
      <button
        type="submit"
        disabled={busy || !currentPassword || !newPassword || !confirmPassword}
        className="w-fit rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
      >
        Update password
      </button>
    </form>
  );
}

function PasswordField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink">
      {label}
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded bg-rail px-3 py-2 text-sm text-ink outline-none focus:ring-1 focus:ring-accent"
      />
    </label>
  );
}
