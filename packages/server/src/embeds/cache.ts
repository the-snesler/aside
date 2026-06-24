import { db } from "../db/index.js";
import { demoEmbedBudget, isDemoMode } from "../demo/index.js";
import { fetchOpenGraph, type OgResult } from "./opengraph.js";

const OK_TTL_MS = 7 * 24 * 60 * 60 * 1000; // refetch a successful preview weekly
const FAIL_TTL_MS = 6 * 60 * 60 * 1000; // negative-cache a dead URL for 6h

export type CachedOg = { status: "ok"; result: OgResult } | { status: "error" };

/**
 * Returns OpenGraph metadata for a URL, fetching + caching on a miss (OG-1's
 * "caches the result in the DB"). Keyed by URL so the same link across many
 * messages costs one fetch. Failures are negative-cached (shorter TTL) so a dead
 * link isn't retried on every message change.
 */
export async function getOpenGraph(url: string): Promise<CachedOg> {
  const cached = await readFresh(url);
  if (cached) return cached;

  // Public-demo guard: cap real outbound fetches per window so a flood of unique
  // URLs can't turn the shared sandbox into an open fetch proxy. Over budget we
  // return an error *without* caching it, so the URL is retried once the window
  // frees up (and existing preview cards are left untouched by the worker).
  if (isDemoMode() && !demoEmbedBudget.tryConsume()) {
    return { status: "error" };
  }

  try {
    const result = await fetchOpenGraph(url);
    await writeCache(url, "ok", JSON.stringify(result));
    return { status: "ok", result };
  } catch {
    await writeCache(url, "error", null);
    return { status: "error" };
  }
}

async function readFresh(url: string): Promise<CachedOg | null> {
  const row = await db
    .selectFrom("og_cache")
    .selectAll()
    .where("url", "=", url)
    .executeTakeFirst();
  if (!row) return null;

  const ttl = row.status === "ok" ? OK_TTL_MS : FAIL_TTL_MS;
  if (Date.now() - row.fetched_at > ttl) return null; // stale → refetch

  if (row.status === "ok" && row.payload) {
    return { status: "ok", result: JSON.parse(row.payload) as OgResult };
  }
  return { status: "error" };
}

async function writeCache(
  url: string,
  status: "ok" | "error",
  payload: string | null,
): Promise<void> {
  const row = { url, status, payload, fetched_at: Date.now() };
  await db
    .insertInto("og_cache")
    .values(row)
    .onConflict((oc) =>
      oc.column("url").doUpdateSet({
        status: row.status,
        payload: row.payload,
        fetched_at: row.fetched_at,
      }),
    )
    .execute();
}
