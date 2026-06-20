import type React from "react";
import { useState } from "react";
import { changePassword } from "../../auth";
import type { ChannelCollection, ConfigCollection } from "../../db/database";
import { useDisplay, type DisplaySettings } from "../../appearance";
import {
  ACCENT_PRESETS,
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
import IconBell from "~icons/lucide/bell";
import IconDatabase from "~icons/lucide/database";
import IconLock from "~icons/lucide/lock-keyhole";
import IconMenu from "~icons/lucide/menu";
import IconPalette from "~icons/lucide/palette";
import IconRss from "~icons/lucide/rss";
import IconSettings from "~icons/lucide/settings";
import IconSparkles from "~icons/lucide/sparkles";

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
  onOpenMenu,
  onFeedsChanged,
}: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>("ai");
  const current = sections.find((section) => section.id === activeSection)!;

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

            {activeSection === "ai" && <AiSettings />}
            {activeSection === "feeds" && (
              <FeedSettings
                channels={channels}
                onFeedsChanged={onFeedsChanged}
              />
            )}
            {activeSection === "appearance" && (
              <AppearanceSettings config={config} />
            )}
            {activeSection === "storage" && <StorageSettings />}
            {activeSection === "notifications" && <NotificationSettings />}
            {activeSection === "security" && <SecuritySettings />}
          </div>
        </section>
      </div>
    </main>
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
          Pick a preset, then fine-tune the accent. Themes sync to every device.
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

      {/* Accent color */}
      <div className="rounded-lg border border-divider bg-panel p-4">
        <h3 className="text-sm font-semibold text-ink">Accent color</h3>
        <p className="mt-1 text-sm text-muted">
          Used for buttons, links, and the active state.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="color"
            aria-label="Accent color"
            value={palette.accent}
            // Live-preview while dragging; persist on commit.
            onInput={(e) =>
              applyTheme({ ...palette, accent: e.currentTarget.value })
            }
            onChange={(e) => setToken("accent", e.currentTarget.value)}
            className="h-9 w-12 cursor-pointer rounded border border-divider bg-rail"
          />
          {ACCENT_PRESETS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`Use accent ${color}`}
              onClick={() => setToken("accent", color)}
              className={`h-7 w-7 rounded-full border transition hover:scale-110 ${
                palette.accent.toLowerCase() === color.toLowerCase()
                  ? "border-ink ring-2 ring-accent"
                  : "border-divider"
              }`}
              style={{ backgroundColor: color }}
            />
          ))}
        </div>
      </div>

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

/** A segmented (radio-style) control for a small set of options. */
function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="inline-flex w-fit rounded-lg border border-divider bg-rail p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={`rounded-md px-3 py-1.5 text-sm transition ${
              value === option.value
                ? "bg-accent font-medium text-white"
                : "text-muted hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function StorageSettings() {
  return (
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
  );
}

function NotificationSettings() {
  const [permission, setPermission] = useState(() =>
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission,
  );

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    setPermission(await Notification.requestPermission());
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
        </div>
        <button
          type="button"
          disabled={permission !== "default"}
          onClick={() => void requestPermission()}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Request permission
        </button>
      </div>
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
