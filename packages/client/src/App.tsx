import { DEFAULT_CHANNEL_ID } from "@aside/shared";
import type React from "react";
import { useEffect, useState } from "react";
import {
  clearAuthToken,
  getAuthStatus,
  getAuthToken,
  logout,
  onAuthLost,
} from "./auth";
import { getDatabase, type AsideDatabase } from "./db/database";
import { startReplication, stopReplication } from "./db/replication";
import { DemoContext, useIsDemo } from "./demo";
import IconInfo from "~icons/lucide/info";
import { useRoutedView } from "./features/routing";
import { useTheme } from "./theme";
import { useDisplay } from "./appearance";
import { AuthScreen } from "./AuthScreen";
import { Workspace } from "./Workspace";

export type AuthMode = "checking" | "setup" | "login" | "app" | "unreachable";

/** Mobile drawer rail width; the foreground card slides this far to expose it. */
export const SIDEBAR_WIDTH = 280;

export function App() {
  const [authMode, setAuthMode] = useState<AuthMode>(() =>
    getAuthToken() ? "app" : "checking",
  );
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let active = true;

    async function checkAuth() {
      const token = getAuthToken();
      if (token) {
        setAuthMode("app");
        try {
          const status = await getAuthStatus();
          if (!active) return;
          if (status.demo) setDemo(true);
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
        // A demo server reports authenticated with no password — go straight in.
        if (status.authenticated) {
          setDemo(!!status.demo);
          setAuthMode("app");
          return;
        }
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
        if (status.authenticated) {
          setDemo(!!status.demo);
          setAuthMode("app");
          return;
        }
        setAuthMode(status.setupRequired ? "setup" : "login");
      })
      .catch(() => setAuthMode("unreachable"));
  }

  return (
    <DemoContext.Provider value={demo}>
      {authMode !== "app" ? (
        <AuthScreen
          mode={authMode}
          onRetry={retryAuth}
          onAuthenticated={() => {
            stopReplication();
            setAuthMode("app");
          }}
        />
      ) : (
        <AuthedApp
          onLogout={() => {
            void logout().finally(() => {
              stopReplication();
              setAuthMode("login");
            });
          }}
        />
      )}
    </DemoContext.Provider>
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

  const isDemo = useIsDemo();

  if (!db) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {isDemo && <DemoBanner />}
      <div className="min-h-0 flex-1">
        <Workspace db={db} view={view} onSelect={setView} onLogout={onLogout} />
      </div>
    </div>
  );
}

/** A thin strip telling demo visitors what's live and what's off. */
function DemoBanner() {
  return (
    <div className="flex shrink-0 items-center justify-center gap-2 bg-accent/15 px-4 py-1.5 text-center text-xs text-ink">
      <IconInfo className="h-3.5 w-3.5 shrink-0 text-accent" />
      <span>
        Public demo — this workspace resets periodically. Uploads, feeds, and AI
        are disabled.
      </span>
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
