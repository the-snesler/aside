import { Cron } from "croner";
import { db } from "../db/index.js";
import { demoResetCron } from "./index.js";
import { seedDemo } from "./seed.js";

/**
 * Tables cleared on each demo cycle: the synced collections plus the derived
 * caches. Blobs/attachments/feed_sources are always empty in the demo (uploads
 * and feeds are disabled), but they're wiped defensively so the slate is clean.
 * Seq counters are intentionally left climbing so reseeded docs get *higher*
 * seqs than anything a connected client already pulled, and converge on it.
 */
const WIPE_TABLES = [
  "messages",
  "channels",
  "embeds",
  "attachments",
  "config",
  "og_cache",
  "blob_thumbnails",
  "blobs",
  "feed_sources",
  "auth_sessions",
] as const;

/** Wipe the workspace back to the curated seed. */
export async function resetDemo(): Promise<void> {
  for (const table of WIPE_TABLES) {
    await db.deleteFrom(table).execute();
  }
  await seedDemo();
}

let job: Cron | null = null;

/** Schedule the periodic wipe + reseed. Called once at boot in demo mode. */
export function startDemoReset(): void {
  job?.stop();
  try {
    job = new Cron(
      demoResetCron(),
      { name: "demo-reset", protect: true },
      () => {
        void resetDemo().catch((err) =>
          console.error("[demo] reset failed:", err),
        );
      },
    );
    console.log(`[demo] workspace will reset on "${demoResetCron()}"`);
  } catch (err) {
    console.error(`[demo] invalid DEMO_RESET_CRON "${demoResetCron()}":`, err);
  }
}
