import { DEFAULT_CHANNEL_ID } from "@aside/shared";
import { useDrag } from "@use-gesture/react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import {
  clearAuthToken,
  getAuthStatus,
  getAuthToken,
  loginPassword,
  logout,
  onAuthLost,
  setupPassword,
} from "./auth";
import { getDatabase, type AsideDatabase } from "./db/database";
import { startReplication, stopReplication } from "./db/replication";
import { ChannelSidebar } from "./features/channels/ChannelSidebar";
import { ChannelSettingsPage } from "./features/channels/ChannelSettingsPage";
import { addMessageChannel } from "./features/channels/membership";
import { listFeeds, type Feed } from "./features/feeds/api";
import { useFeedUnread } from "./features/feeds/unread";
import { LightboxProvider } from "./features/lightbox/LightboxProvider";
import { MessageList } from "./features/messages/MessageList";
import { SearchPalette } from "./features/search/SearchPalette";
import { useSearchIndex } from "./features/search/searchIndex";
import { SettingsPage } from "./features/settings/SettingsPage";
import { useRoutedView } from "./features/routing";
import { SETTINGS_ID, isSmartView, useNoteCounts } from "./features/views";
import { useTheme } from "./theme";
import { useDisplay } from "./appearance";

type AuthMode = "checking" | "setup" | "login" | "app" | "unreachable";

/** Mobile drawer rail width; the foreground card slides this far to expose it. */
const SIDEBAR_WIDTH = 280;

export function App() {
  const [authMode, setAuthMode] = useState<AuthMode>(() =>
    getAuthToken() ? "app" : "checking",
  );

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      const token = getAuthToken();
      if (token) {
        setAuthMode("app");
        try {
          const status = await getAuthStatus();
          if (!active) return;
          if (!status.authenticated) {
            clearAuthToken();
            stopReplication();
            setAuthMode(status.setupRequired ? "setup" : "login");
          }
        } catch {
          // Local-first: keep showing cached data while the server is offline.
        }
        return;
      }

      try {
        const status = await getAuthStatus();
        if (!active) return;
        setAuthMode(status.setupRequired ? "setup" : "login");
      } catch {
        if (active) setAuthMode("unreachable");
      }
    }

    void checkAuth();
    const unsubscribe = onAuthLost(() => {
      stopReplication();
      setAuthMode("login");
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  function retryAuth() {
    const token = getAuthToken();
    if (token) {
      setAuthMode("app");
      return;
    }

    setAuthMode("checking");
    void getAuthStatus()
      .then((status) => {
        setAuthMode(status.setupRequired ? "setup" : "login");
      })
      .catch(() => setAuthMode("unreachable"));
  }

  if (authMode !== "app") {
    return (
      <AuthScreen
        mode={authMode}
        onRetry={retryAuth}
        onAuthenticated={() => {
          stopReplication();
          setAuthMode("app");
        }}
      />
    );
  }

  return (
    <AuthedApp
      onLogout={() => {
        void logout().finally(() => {
          stopReplication();
          setAuthMode("login");
        });
      }}
    />
  );
}

function AuthedApp({ onLogout }: { onLogout: () => void }) {
  const [db, setDb] = useState<AsideDatabase | null>(null);
  // The URL is the source of truth for the current view, so reloads and
  // back/forward land on the section you were looking at (defaults to "All
  // Notes" at the root path).
  const [view, setView] = useRoutedView();

  useEffect(() => {
    let active = true;
    void getDatabase().then(async (database) => {
      if (!active) return;
      await ensureDefaultChannel(database);
      startReplication({ collection: database.messages, name: "messages" });
      startReplication({ collection: database.channels, name: "channels" });
      // Embeds are server-authoritative; the client only ever pulls them, so the
      // generic push handler simply never has local changes to send.
      startReplication({ collection: database.embeds, name: "embeds" });
      startReplication({
        collection: database.attachments,
        name: "attachments",
      });
      // Synced theme palette + future settings.
      startReplication({ collection: database.config, name: "config" });
      setDb(database);
    });
    return () => {
      active = false;
      stopReplication();
    };
  }, []);

  // Apply the synced theme as soon as the config collection exists; no-op until then.
  useTheme(db?.config ?? null);
  // Apply per-device display prefs (density, text size, motion) from localStorage.
  useDisplay();

  if (!db) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  return (
    <Workspace db={db} view={view} onSelect={setView} onLogout={onLogout} />
  );
}

function Workspace({
  db,
  view,
  onSelect,
  onLogout,
}: {
  db: AsideDatabase;
  view: string;
  onSelect: (view: string) => void;
  onLogout: () => void;
}) {
  const counts = useNoteCounts(db.messages, db.attachments);
  const { channels, search } = useSearchIndex(db);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [channelSettingsId, setChannelSettingsId] = useState<string | null>(
    null,
  );
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const { unreadChannelIds, markChannelRead } = useFeedUnread(
    db.messages,
    db.config,
    feeds,
  );

  const reloadFeeds = useCallback(async () => {
    setFeeds(await listFeeds());
  }, []);

  useEffect(() => {
    void reloadFeeds().catch(() => undefined);
    function onFocus() {
      void reloadFeeds().catch(() => undefined);
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadFeeds]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Finger-tracked drawer: while dragging we drive the offset 1:1 with the
  // finger (clamped to the rail width); on release we snap open/closed on a
  // distance-or-velocity threshold. `drag` being non-null means a gesture is in
  // flight, which also turns the CSS transition off so it tracks instantly.
  const [drag, setDrag] = useState<number | null>(null);
  const bindDrag = useDrag(
    ({ last, movement: [mx], velocity: [vx], direction: [dx] }) => {
      const base = sidebarOpen ? SIDEBAR_WIDTH : 0;
      if (last) {
        setDrag(null);
        if (dx > 0 && (mx > 64 || vx > 0.45)) setSidebarOpen(true);
        else if (dx < 0 && (mx < -64 || vx > 0.45)) setSidebarOpen(false);
        return;
      }
      setDrag(Math.min(SIDEBAR_WIDTH, Math.max(0, base + mx)));
    },
    { axis: "x", filterTaps: true },
  );

  const sidebarOffset = drag ?? (sidebarOpen ? SIDEBAR_WIDTH : 0);
  // The foreground card rounds its corners as it slides aside, matching the
  // phone's screen radius (à la the Claude iOS app). Reset to square on desktop.
  const cardRadius = Math.round((sidebarOffset / SIDEBAR_WIDTH) * 28);

  function selectView(nextView: string) {
    setChannelSettingsId(null);
    if (nextView !== view && !isSmartView(nextView)) {
      void markChannelRead(nextView);
    }
    onSelect(nextView);
    setSidebarOpen(false);
  }

  const handleNavigateToNote = useCallback(
    (channelId: string, messageId: string) => {
      if (channelId !== view) void markChannelRead(channelId);
      onSelect(channelId);
      setSidebarOpen(false);
      setFocusedMessageId(messageId);
    },
    [markChannelRead, onSelect, view],
  );

  const handleDropMessage = useCallback(
    (channelId: string, messageId: string) => {
      void db.messages
        .findOne(messageId)
        .exec()
        .then((message) => {
          if (!message) return;
          const channelIds = addMessageChannel(message, channelId);
          if (channelIds.join("\0") === message.channelIds.join("\0")) return;
          return message.incrementalPatch({
            channelIds,
            updatedAt: Date.now(),
          });
        });
    },
    [db.messages],
  );

  // The sidebar is its own gradient plane; the feed is a separate white card that
  // floats on top of it (a slight overlap, raised z-index + shadow) rather than
  // sharing one rounded container — so the chrome reads as a layer behind the
  // content. On mobile the sidebar sits underneath and the content layer slides
  // aside to expose it.
  return (
    <LightboxProvider>
      <div className="relative flex h-full overflow-hidden md:p-2">
        <ChannelSidebar
          collection={db.channels}
          counts={counts}
          unreadChannelIds={unreadChannelIds}
          selectedView={view}
          onSelect={selectView}
          onOpenSettings={() => selectView(SETTINGS_ID)}
          onOpenChannelSettings={(channelId) => {
            setChannelSettingsId(channelId);
            setSidebarOpen(false);
          }}
          onOpenSearch={() => setPaletteOpen(true)}
          onLogout={onLogout}
          onDropMessage={handleDropMessage}
        />
        <div
          {...bindDrag()}
          className={`relative z-10 flex h-full min-w-0 flex-1 translate-x-[var(--sidebar-offset)] touch-pan-y overflow-hidden rounded-[var(--card-radius)] md:translate-x-0 md:overflow-visible md:rounded-none ${
            drag === null
              ? "transition-[transform,border-radius] duration-200 ease-out"
              : ""
          }`}
          style={
            {
              "--sidebar-offset": `${sidebarOffset}px`,
              "--card-radius": `${cardRadius}px`,
            } as React.CSSProperties
          }
        >
          {channelSettingsId ? (
            <ChannelSettingsPage
              channels={db.channels}
              channelId={channelSettingsId}
              onOpenMenu={() => setSidebarOpen(true)}
              onClose={(nextView) => {
                setChannelSettingsId(null);
                if (nextView) selectView(nextView);
              }}
            />
          ) : view === SETTINGS_ID ? (
            <SettingsPage
              channels={db.channels}
              config={db.config}
              onOpenMenu={() => setSidebarOpen(true)}
              onFeedsChanged={reloadFeeds}
            />
          ) : (
            <MessageList
              messages={db.messages}
              channels={db.channels}
              embeds={db.embeds}
              attachments={db.attachments}
              view={view}
              counts={counts}
              onOpenMenu={() => setSidebarOpen(true)}
              onOpenSettings={() => selectView(SETTINGS_ID)}
              onOpenSearch={() => setPaletteOpen(true)}
              focusedMessageId={focusedMessageId}
            />
          )}
        </div>
        <SearchPalette
          open={paletteOpen}
          activeView={view}
          channels={channels}
          search={search}
          onClose={() => setPaletteOpen(false)}
          onSelectView={selectView}
          onNavigateToNote={handleNavigateToNote}
        />
      </div>
    </LightboxProvider>
  );
}

function AuthScreen({
  mode,
  onRetry,
  onAuthenticated,
}: {
  mode: AuthMode;
  onRetry: () => void;
  onAuthenticated: () => void;
}) {
  const isSetup = mode === "setup";
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (isSetup) await setupPassword(password);
      else await loginPassword(password);
      setPassword("");
      onAuthenticated();
    } catch {
      setError(isSetup ? "Could not create password." : "Incorrect password.");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "checking") {
    return (
      <div className="flex h-full items-center justify-center bg-chat text-muted">
        Loading…
      </div>
    );
  }

  if (mode === "unreachable") {
    return (
      <div className="flex h-full items-center justify-center bg-chat px-4">
        <div className="w-full max-w-sm rounded border border-divider bg-panel p-5 shadow">
          <h1 className="text-lg font-semibold text-ink">Server unavailable</h1>
          <p className="mt-2 text-sm text-muted">
            Start the server, then try again.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center bg-chat px-4">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm rounded border border-divider bg-panel p-5 shadow"
      >
        <h1 className="text-lg font-semibold text-ink">
          {isSetup ? "Create password" : "Log in"}
        </h1>
        <label className="mt-4 block text-sm font-medium text-muted">
          Password
          <input
            autoFocus
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full rounded bg-rail px-3 py-2 text-ink outline-none ring-1 ring-divider focus:ring-accent"
          />
        </label>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        <button
          type="submit"
          disabled={!password || busy}
          className="mt-4 w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Working…" : isSetup ? "Create" : "Log in"}
        </button>
      </form>
    </div>
  );
}

/**
 * Ensures the default channel exists so messages written before there was a
 * channel UI (which carry `channelIds: ["general"]`) have a home. Uses a fixed id
 * and `upsert`, so a race across devices converges through the conflict handler
 * instead of throwing on a duplicate insert.
 */
async function ensureDefaultChannel(db: AsideDatabase): Promise<void> {
  const existing = await db.channels.findOne(DEFAULT_CHANNEL_ID).exec();
  if (existing) return;
  const now = Date.now();
  await db.channels.upsert({
    id: DEFAULT_CHANNEL_ID,
    name: "general",
    createdAt: now,
    updatedAt: now,
  });
}
