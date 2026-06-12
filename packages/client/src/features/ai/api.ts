/**
 * Client for the server-only ambient-AI API (`/api/ai/*`). Like feeds, the AI
 * config (provider, model, base URL, API key) lives outside RxDB — it carries a
 * secret and server state — so this talks to the endpoints over plain fetch. The
 * notes/channels the bots edit still arrive through the normal sync streams.
 */
import { authFetch } from "../../auth";

export type AiProvider = "anthropic" | "openai" | "openai-compatible";

/** Client-safe config: the API key is masked to a presence flag. */
export interface AiConfig {
  organizerEnabled: boolean;
  describerEnabled: boolean;
  provider: AiProvider;
  model: string;
  baseUrl: string | null;
  hasApiKey: boolean;
  describeCron: string;
  options: Record<string, unknown>;
  lastStatus: string | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface UpdateAiConfigInput {
  organizerEnabled?: boolean;
  describerEnabled?: boolean;
  provider?: AiProvider;
  model?: string;
  baseUrl?: string | null;
  /** "" clears the stored key; omit to leave it unchanged. */
  apiKey?: string | null;
  describeCron?: string;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(url, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`,
    );
  }
  return res.json() as Promise<T>;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function getAiConfig(): Promise<AiConfig> {
  return request("/api/ai/config");
}

export function updateAiConfig(patch: UpdateAiConfigInput): Promise<AiConfig> {
  return request("/api/ai/config", jsonInit("PATCH", patch));
}

export function reorganize(): Promise<{ ok: boolean }> {
  return request("/api/ai/reorganize", { method: "POST" });
}

export function redescribe(): Promise<{ ok: boolean }> {
  return request("/api/ai/redescribe", { method: "POST" });
}
