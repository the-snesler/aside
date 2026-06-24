import { db } from "../db/index.js";
import { channelsSync } from "../sync/channels.js";
import { messagesSync } from "../sync/messages.js";
import { writeServerBatch } from "../sync/server-write.js";
import { buildDemoSeed } from "./seed-data.js";

/**
 * Populates the demo workspace with curated channels + notes. Idempotent on
 * boot: a no-op if any live note already exists, so a server restart over an
 * existing demo volume doesn't churn the data. {@link resetDemo} wipes first,
 * so the guard passes there and the content is rebuilt.
 *
 * Writes go through {@link writeServerBatch} (the server-authoritative path), so
 * each doc gets a fresh seq and a single SSE batch — connected clients pull the
 * seed live, and the embed worker (subscribed to message writes) fetches link
 * previews for the seeded URLs.
 */
export async function seedDemo(): Promise<void> {
  const existing = await db
    .selectFrom("messages")
    .select("id")
    .where("deleted", "=", 0)
    .limit(1)
    .executeTakeFirst();
  if (existing) return;

  const { channels, messages } = buildDemoSeed();
  await writeServerBatch(channelsSync, channels);
  await writeServerBatch(messagesSync, messages);
}
