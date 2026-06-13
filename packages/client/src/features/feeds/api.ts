/**
 * Client for the server-only feeds API (`/api/feeds*`). Feeds carry credentials
 * and server config, so they live outside RxDB — this talks to the endpoints
 * over plain fetch. The notes a feed produces still arrive via normal message
 * replication.
 */
import { authFetch } from "../../auth";

export type FeedStatus = "ok" | "running" | "auth_required" | "error";

export interface Feed {
  id: string;
  type: string;
  channelId: string;
  channelName: string;
  cron: string;
  enabled: boolean;
  options: Record<string, unknown>;
  cursor: Record<string, unknown> | null;
  lastRunAt: number | null;
  lastStatus: FeedStatus | null;
  lastError: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface FeedRunResult {
  feedId: string;
  status: FeedStatus;
  written: number;
  total: number;
  error: string | null;
}

export interface CreateFeedInput {
  type: string;
  channelName: string;
  channelId?: string;
  cron?: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
}

export interface UpdateFeedInput {
  channelId?: string;
  channelName?: string;
  cron?: string;
  enabled?: boolean;
  options?: Record<string, unknown>;
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

export function listSourceTypes(): Promise<string[]> {
  return request("/api/feeds/sources");
}

export function listFeeds(): Promise<Feed[]> {
  return request("/api/feeds");
}

export function createFeed(input: CreateFeedInput): Promise<Feed> {
  return request("/api/feeds", jsonInit("POST", input));
}

export function updateFeed(id: string, patch: UpdateFeedInput): Promise<Feed> {
  return request(`/api/feeds/${id}`, jsonInit("PATCH", patch));
}

export function deleteFeed(id: string): Promise<{ ok: boolean }> {
  return request(`/api/feeds/${id}`, { method: "DELETE" });
}

export function refreshFeed(id: string): Promise<FeedRunResult> {
  return request(`/api/feeds/${id}/refresh`, { method: "POST" });
}

/** Body is the cookie array exported by a browser extension. */
export function setCookies(
  id: string,
  cookies: unknown,
): Promise<{ ok: boolean }> {
  return request(`/api/feeds/${id}/cookies`, jsonInit("POST", cookies));
}
