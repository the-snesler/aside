import { join } from "node:path";

/**
 * Per-feed working directory under the data volume, holding the persistent
 * browser profile and any seeded `cookies.json`. Mirrors the DATA_DIR default
 * used by the SQLite path in db/index.ts, so everything lives on the same
 * mounted `/data` volume in the container and survives restarts.
 */
export function feedsRoot(): string {
  const dataDir = process.env.DATA_DIR ?? "./data";
  return join(dataDir, "feeds");
}

export function feedDir(feedId: string): string {
  return join(feedsRoot(), feedId);
}
