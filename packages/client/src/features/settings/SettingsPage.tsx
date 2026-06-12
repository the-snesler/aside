import type React from "react";
import { useState } from "react";
import { changePassword } from "../../auth";
import type { ChannelCollection, ConfigCollection } from "../../db/database";
import { DEFAULT_THEME } from "../../theme";
import { FeedSettings } from "../feeds/FeedSettings";
import IconBell from "~icons/lucide/bell";
import IconDatabase from "~icons/lucide/database";
import IconLock from "~icons/lucide/lock-keyhole";
import IconMenu from "~icons/lucide/menu";
import IconPalette from "~icons/lucide/palette";
import IconRss from "~icons/lucide/rss";
import IconSettings from "~icons/lucide/settings";

type SectionId =
  | "feeds"
  | "appearance"
  | "storage"
  | "notifications"
  | "security";

interface Props {
  channels: ChannelCollection;
  config: ConfigCollection;
  onOpenMenu: () => void;
}

const sections: Array<{
  id: SectionId;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
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

export function SettingsPage({ channels, config, onOpenMenu }: Props) {
  const [activeSection, setActiveSection] = useState<SectionId>("feeds");
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

            {activeSection === "feeds" && <FeedSettings channels={channels} />}
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
  const [saved, setSaved] = useState(false);

  async function resetTheme() {
    const now = Date.now();
    await config.upsert({
      id: "theme",
      value: JSON.stringify(DEFAULT_THEME),
      createdAt: now,
      updatedAt: now,
    });
    setSaved(true);
  }

  return (
    <div className="rounded-lg border border-divider bg-panel p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">Theme palette</h3>
          <p className="mt-1 text-sm text-muted">
            Restore the default synced Aside colors on this device and any other
            device that replicates settings.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void resetTheme()}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          Reset theme
        </button>
      </div>
      {saved && <p className="mt-3 text-sm text-muted">Theme reset.</p>}
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
