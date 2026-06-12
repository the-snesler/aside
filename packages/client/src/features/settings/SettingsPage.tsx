import type React from "react";
import IconBell from "~icons/lucide/bell";
import IconDatabase from "~icons/lucide/database";
import IconMenu from "~icons/lucide/menu";
import IconPalette from "~icons/lucide/palette";
import IconRss from "~icons/lucide/rss";
import IconSettings from "~icons/lucide/settings";

export function SettingsPage({ onOpenMenu }: { onOpenMenu: () => void }) {
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-2 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3">
          <SettingsSection
            icon={<IconRss className="h-5 w-5" />}
            title="Feeds"
            description="Sources, schedules, sessions, and refresh status."
          />
          <SettingsSection
            icon={<IconPalette className="h-5 w-5" />}
            title="Appearance"
            description="Theme, density, and display preferences."
          />
          <SettingsSection
            icon={<IconDatabase className="h-5 w-5" />}
            title="Storage"
            description="Local database, sync status, and attachment cache."
          />
          <SettingsSection
            icon={<IconBell className="h-5 w-5" />}
            title="Notifications"
            description="Device alerts and install-time permissions."
          />
        </div>
      </div>
    </main>
  );
}

function SettingsSection({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-lg border border-divider bg-panel p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-active text-accent">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{title}</h2>
          <p className="mt-1 text-sm text-muted">{description}</p>
        </div>
      </div>
    </section>
  );
}
