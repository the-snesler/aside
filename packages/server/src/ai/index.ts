import type { ReplicatedMessageDoc } from "@aside/shared";
import { db } from "../db/index.js";
import { onChange } from "../sync/stream.js";
import { getAiConfig } from "./config.js";
import {
  describeAllStale,
  describeChannel,
  startDescriberScheduler,
  stopDescriberScheduler,
} from "./describer.js";
import { enqueueOrganize } from "./organizer.js";

let subscribed = false;

/**
 * Starts the ambient AI: two cooperating, server-authoritative background bots.
 *
 *  - The **organizer** subscribes to message writes (client sends AND feed
 *    imports both fan out through `emitChange("messages")`) and a boot backfill,
 *    and adds the best-matching topical channel(s) to each note. It writes back
 *    to `messages`, so a per-message text-hash guard (ai_message_state) breaks
 *    the resulting onChange feedback loop.
 *  - The **describer** keeps a short description on each channel (read by the
 *    organizer), driven by the organizer marking channels dirty plus a cron sweep.
 *
 * Both no-op when disabled (the default) — each worker re-checks the config — so
 * an install without an API key is unaffected. Must run after initDb().
 */
export function startAmbientAi(): void {
  if (!subscribed) {
    onChange("messages", (event) => {
      for (const doc of event.documents as ReplicatedMessageDoc[]) {
        if (doc._deleted) continue;
        enqueueOrganize(doc.id);
      }
    });
    subscribed = true;
  }

  void backfillOrganize();
  void startDescriberScheduler();
  void describeAllStale();
}

/**
 * Re-apply config after it changes via the API: restart the describer cron
 * (schedule/enabled may have changed) and kick a backfill + describe sweep so a
 * freshly enabled bot starts working immediately.
 */
export async function reinitAmbientAi(): Promise<void> {
  await startDescriberScheduler();
  await backfillOrganize();
  void describeAllStale();
}

export { stopDescriberScheduler };

/** Manual trigger: enqueue every live message for (re)classification. */
export async function backfillOrganize(): Promise<void> {
  const config = await getAiConfig();
  if (!config.organizerEnabled) return;
  const rows = await db
    .selectFrom("messages")
    .select(["id"])
    .where("deleted", "=", 0)
    .execute();
  for (const row of rows) enqueueOrganize(row.id);
}

/** Manual trigger: re-describe every live channel now, ignoring the cooldown. */
export async function redescribeAll(): Promise<void> {
  const config = await getAiConfig();
  if (!config.describerEnabled) return;
  const rows = await db
    .selectFrom("channels")
    .select(["id"])
    .where("deleted", "=", 0)
    .execute();
  for (const row of rows) {
    try {
      await describeChannel(row.id, true);
    } catch (err) {
      console.error(`[ai] redescribe ${row.id} failed:`, err);
    }
  }
}
