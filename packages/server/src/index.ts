import { serve } from "@hono/node-server";
import { startAmbientAi } from "./ai/index.js";
import { createApp } from "./app.js";
import { startBlobGc } from "./blobs/gcScheduler.js";
import { initDb } from "./db/index.js";
import { isDemoMode } from "./demo/index.js";
import { startDemoReset } from "./demo/reset.js";
import { seedDemo } from "./demo/seed.js";
import { startEmbeds } from "./embeds/index.js";
import { startFeedScheduler } from "./feeds/scheduler.js";

const PORT = Number(process.env.PORT ?? 3001);

await initDb();

// Begin OpenGraph extraction: subscribe to message writes + backfill existing
// notes. Must run after initDb so the embeds seq counter is primed.
startEmbeds();

// Begin ambient AI: the organizer (auto-tags notes into channels) and describer
// (keeps channel descriptions current). No-op until enabled in settings; must
// run after initDb so the seq counters are primed.
startAmbientAi();

const app = createApp();

// Schedule enabled feeds. Cron ticks fire on their own interval; nothing runs
// on boot, so startup stays fast.
await startFeedScheduler();

// Periodically purge orphaned blobs (attachments whose messages were deleted,
// stale thumbnails). Runs on its own cron; nothing sweeps on boot.
startBlobGc();

// Public demo: seed the curated workspace (if empty) and schedule the periodic
// wipe + reseed. Must run after startEmbeds so seeded URLs get link previews.
if (isDemoMode()) {
  await seedDemo();
  startDemoReset();
}

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`aside server listening on :${info.port}`);
});
