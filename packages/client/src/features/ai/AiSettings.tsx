import { useCallback, useEffect, useState } from "react";
import IconRefresh from "~icons/lucide/refresh-cw";
import IconSparkles from "~icons/lucide/sparkles";
import {
  getAiConfig,
  redescribe,
  reorganize,
  updateAiConfig,
  type AiConfig,
  type AiProvider,
} from "./api";

const PROVIDERS: Array<{ id: AiProvider; label: string }> = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "openai-compatible", label: "OpenAI-compatible (local / OSS)" },
];

/**
 * Ambient AI manager: enable the two background bots (organizer + describer),
 * pick the LLM provider/model/base URL, and set the API key. Talks to the
 * `/api/ai/*` endpoints over fetch; the notes/channels the bots edit arrive via
 * the usual sync streams. The key is write-only — the server returns only a
 * `hasApiKey` flag, never the secret.
 */
export function AiSettings() {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<"reorganize" | "redescribe" | null>(null);

  // Editable form state, seeded from the loaded config.
  const [provider, setProvider] = useState<AiProvider>("anthropic");
  const [model, setModel] = useState("claude-haiku-4-5");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [organizerEnabled, setOrganizerEnabled] = useState(false);
  const [describerEnabled, setDescriberEnabled] = useState(false);

  const apply = useCallback((c: AiConfig) => {
    setConfig(c);
    setProvider(c.provider);
    setModel(c.model);
    setBaseUrl(c.baseUrl ?? "");
    setOrganizerEnabled(c.organizerEnabled);
    setDescriberEnabled(c.describerEnabled);
    setApiKey("");
  }, []);

  useEffect(() => {
    getAiConfig()
      .then(apply)
      .catch((err) => setError(message(err)));
  }, [apply]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const updated = await updateAiConfig({
        provider,
        model: model.trim(),
        baseUrl: baseUrl.trim() ? baseUrl.trim() : null,
        organizerEnabled,
        describerEnabled,
        // Only send the key when the user typed one (write-only field).
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      apply(updated);
      setSavedAt(Date.now());
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  }

  async function clearKey() {
    setSaving(true);
    setError(null);
    try {
      apply(await updateAiConfig({ apiKey: "" }));
      setSavedAt(Date.now());
    } catch (err) {
      setError(message(err));
    } finally {
      setSaving(false);
    }
  }

  async function trigger(which: "reorganize" | "redescribe") {
    setBusy(which);
    setError(null);
    try {
      await (which === "reorganize" ? reorganize() : redescribe());
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(null);
    }
  }

  if (!config) {
    return (
      <p className="text-sm text-muted">
        {error ?? "Loading ambient AI settings…"}
      </p>
    );
  }

  const showBaseUrl = provider !== "anthropic";

  return (
    <form onSubmit={save} className="flex flex-col gap-4">
      {error && (
        <p className="rounded bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 rounded-lg border border-divider bg-panel p-4">
        <div className="flex items-center gap-2">
          <IconSparkles className="h-5 w-5 text-accent" />
          <div>
            <p className="text-sm font-medium text-ink">Status</p>
            <p className="text-xs text-muted">
              Background bots run on the server. Nothing runs until enabled and
              a key is set.
            </p>
          </div>
        </div>
        <StatusBadge status={config.lastStatus} error={config.lastError} />
      </div>

      {/* Bots */}
      <div className="flex flex-col gap-2 rounded-lg border border-divider bg-panel p-4">
        <Toggle
          label="Organizer"
          hint="Auto-tags new notes into the channels that fit (never removes a channel)."
          checked={organizerEnabled}
          onChange={setOrganizerEnabled}
        />
        <Toggle
          label="Describer"
          hint="Keeps a short description on each channel to guide the organizer."
          checked={describerEnabled}
          onChange={setDescriberEnabled}
        />
      </div>

      {/* Provider / model */}
      <div className="flex flex-col gap-3 rounded-lg border border-divider bg-panel p-4">
        <Field label="Provider">
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as AiProvider)}
            className="rounded bg-rail px-2 py-1.5 text-sm text-ink outline-none focus:ring-1 focus:ring-accent"
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Model">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="claude-haiku-4-5"
            className="rounded bg-rail px-2 py-1.5 font-mono text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
          />
        </Field>

        {showBaseUrl && (
          <Field label="Base URL">
            <input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="http://localhost:11434/v1"
              className="rounded bg-rail px-2 py-1.5 font-mono text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
            />
          </Field>
        )}

        <Field
          label={`API key${config.hasApiKey ? " (set)" : ""}`}
          hint={
            provider === "openai-compatible"
              ? "Optional for local endpoints that need no key."
              : undefined
          }
        >
          <div className="flex items-center gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={config.hasApiKey ? "•••••••• (unchanged)" : "sk-…"}
              className="min-w-0 flex-1 rounded bg-rail px-2 py-1.5 font-mono text-sm text-ink outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
            />
            {config.hasApiKey && (
              <button
                type="button"
                onClick={() => void clearKey()}
                disabled={saving}
                className="shrink-0 rounded px-2 py-1.5 text-xs text-muted hover:bg-hover hover:text-danger disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
        </Field>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {savedAt && !saving && (
          <span className="text-sm text-muted">Saved.</span>
        )}
      </div>

      {/* Manual triggers */}
      <div className="flex flex-wrap gap-2 border-t border-divider pt-4">
        <p className="w-full text-xs font-semibold uppercase tracking-wide text-muted">
          Run now
        </p>
        <TriggerButton
          label="Re-organize notes"
          busy={busy === "reorganize"}
          disabled={!config.organizerEnabled || busy !== null}
          onClick={() => void trigger("reorganize")}
        />
        <TriggerButton
          label="Regenerate descriptions"
          busy={busy === "redescribe"}
          disabled={!config.describerEnabled || busy !== null}
          onClick={() => void trigger("redescribe")}
        />
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-ink">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 text-sm text-ink">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
      </span>
    </label>
  );
}

function TriggerButton({
  label,
  busy,
  disabled,
  onClick,
}: {
  label: string;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex items-center gap-1.5 rounded border border-divider bg-sidebar px-3 py-1.5 text-sm text-ink hover:bg-hover disabled:opacity-50"
    >
      <IconRefresh className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
      {label}
    </button>
  );
}

function StatusBadge({
  status,
  error,
}: {
  status: string | null;
  error: string | null;
}) {
  const map: Record<string, { label: string; cls: string }> = {
    ok: { label: "ok", cls: "bg-emerald-500/10 text-emerald-600" },
    error: { label: "error", cls: "bg-red-500/10 text-red-600" },
  };
  const view = status
    ? (map[status] ?? { label: status, cls: "bg-hover text-muted" })
    : { label: "idle", cls: "bg-hover text-muted" };
  return (
    <span
      title={error ?? undefined}
      className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${view.cls}`}
    >
      {view.label}
    </span>
  );
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
