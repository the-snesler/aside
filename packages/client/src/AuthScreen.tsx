import type React from "react";
import { useState } from "react";
import { AuthMode } from "./App";
import { setupPassword, loginPassword } from "./auth";
import LogoWide from "./LogoWide";

export function AuthScreen({
  mode, onRetry, onAuthenticated,
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
    <div className="flex h-full items-center justify-center px-4">
      <form
        onSubmit={(e) => void submit(e)}
        className="w-full max-w-sm rounded-xl border border-divider bg-chat p-12 shadow"
      >
        <LogoWide className="max-h-16 w-auto mx-auto mb-8" />
        <h1 className="text-lg font-semibold text-ink">
          {isSetup ? "Create password" : "Welcome back"}
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
