import { DEFAULT_CHANNEL_ID } from "@aside/shared";
import { db } from "../db/index.js";

/** A channel the organizer can route into. */
export interface ClassifiableChannel {
  id: string;
  name: string;
  description: string | null;
}

/**
 * Candidate channels for the organizer: live (non-deleted), excluding the
 * `general` catch-all (routing *into* general is a no-op). When this is empty
 * there's nothing to organize into, so the worker skips the message.
 */
export async function listClassifiableChannels(): Promise<
  ClassifiableChannel[]
> {
  const rows = await db
    .selectFrom("channels")
    .select(["id", "name", "description"])
    .where("deleted", "=", 0)
    .where("id", "!=", DEFAULT_CHANNEL_ID)
    .orderBy("created_at", "asc")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
  }));
}

/**
 * Recent note texts in a channel, newest first. Membership lives in the JSON
 * `channel_ids` array (with the legacy single `channel_id` as a fallback), so we
 * match the quoted id inside the array — good enough for a single-user store.
 */
export async function fetchRecentChannelMessages(
  channelId: string,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .selectFrom("messages")
    .select(["text"])
    .where("deleted", "=", 0)
    .where((eb) =>
      eb.or([
        eb("channel_ids", "like", `%"${channelId}"%`),
        eb("channel_id", "=", channelId),
      ]),
    )
    .orderBy("updated_at", "desc")
    .limit(limit)
    .execute();
  return rows.map((row) => row.text).filter((text) => text.trim().length > 0);
}
