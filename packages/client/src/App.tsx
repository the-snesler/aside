import { DEFAULT_CHANNEL_ID } from "@aside/shared";
import { useEffect, useState } from "react";
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
import { HOME_ID } from "./features/channels/home";
import { MessageList } from "./features/messages/MessageList";

type AuthMode = "checking" | "setup" | "login" | "app" | "unreachable";

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
  // Open on Home — the unified view across every channel.
  const [channelId, setChannelId] = useState<string>(HOME_ID);

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
      setDb(database);
    });
    return () => {
      active = false;
      stopReplication();
    };
  }, []);

  if (!db) {
    return (
      <div className="flex h-full items-center justify-center text-muted">
        Loading…
      </div>
    );
  }

  return (
    <div className="grid h-full grid-cols-[240px_1fr] overflow-hidden">
      <ChannelSidebar
        collection={db.channels}
        selectedId={channelId}
        onSelect={setChannelId}
        onLogout={onLogout}
      />
      <MessageList
        messages={db.messages}
        channels={db.channels}
        embeds={db.embeds}
        attachments={db.attachments}
        channelId={channelId}
      />
    </div>
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
 * channel UI (which carry `channelId: "general"`) have a home. Uses a fixed id
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
