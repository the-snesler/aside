import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { feedDir } from "./paths.js";

/**
 * Persists a cookie array (as exported by a browser extension such as "Get
 * cookies.txt LOCALLY") into the feed's working dir. The source seeds these
 * into its persistent browser profile on the next run, then deletes the file —
 * after that the profile keeps the session warm on its own.
 */
export function saveFeedCookies(feedId: string, cookies: unknown): void {
  if (!Array.isArray(cookies)) {
    throw new Error("cookies must be a JSON array");
  }
  const dir = feedDir(feedId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "cookies.json"), JSON.stringify(cookies), "utf8");
}
