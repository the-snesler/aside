import type { ReplicatedMessageDoc } from "@aside/shared";
import { db } from "../db/index.js";
import { onChange } from "../sync/stream.js";
import { extractUrls } from "./extract.js";
import { enqueueEmbedExtraction } from "./worker.js";

/**
 * Starts OpenGraph embed extraction (OG-1). Drives the worker from two sources:
 *
 *  1. Live message writes — client send/edit AND feed imports all fan out through
 *     `emitChange("messages")`, so a single `onChange` subscription covers every
 *     way a note can land. We never write the message back, so attaching a
 *     preview never marks the note as edited.
 *  2. A boot-time backfill for notes that arrived while the server was down (or
 *     before this feature existed) and so never fired an `onChange`.
 *
 * No feedback loop: this listens only on "messages" and the worker writes only to
 * "embeds" (a different emitter namespace).
 */
export function startEmbeds(): void {
  onChange("messages", (event) => {
    for (const doc of event.documents as ReplicatedMessageDoc[]) {
      if (doc._deleted) continue;
      if (extractUrls(doc.text).length === 0) continue;
      enqueueEmbedExtraction(doc.id);
    }
  });

  void reconcileEmbeds();
}

/**
 * Enqueues every existing, non-deleted message that contains a URL. The worker
 * pulls OpenGraph data from the URL cache (warm after the first run), so a
 * message whose preview is already current results in no write — only genuine
 * gaps produce embeds.
 */
async function reconcileEmbeds(): Promise<void> {
  try {
    const rows = await db
      .selectFrom("messages")
      .select(["id", "text"])
      .where("deleted", "=", 0)
      .execute();
    for (const row of rows) {
      if (extractUrls(row.text).length > 0) enqueueEmbedExtraction(row.id);
    }
  } catch (err) {
    console.error("[embeds] reconcile failed:", err);
  }
}
