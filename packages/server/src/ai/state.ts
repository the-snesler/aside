import { createHash } from "node:crypto";
import { db } from "../db/index.js";
import type { AiChannelStateTable, AiMessageStateTable } from "../db/types.js";

/** Stable content hash used by both loop-guard tables. */
export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

// --- Organizer (per-message) state ------------------------------------------

export async function getMessageState(
  messageId: string,
): Promise<AiMessageStateTable | null> {
  const row = await db
    .selectFrom("ai_message_state")
    .selectAll()
    .where("message_id", "=", messageId)
    .executeTakeFirst();
  return row ?? null;
}

export async function saveMessageState(
  messageId: string,
  input: {
    textHash: string;
    assignedChannelIds: string[];
    status: "ok" | "skipped" | "error";
    error?: string | null;
  },
): Promise<void> {
  const row: AiMessageStateTable = {
    message_id: messageId,
    text_hash: input.textHash,
    assigned_channel_ids: JSON.stringify(input.assignedChannelIds),
    status: input.status,
    last_error: input.error ?? null,
    updated_at: Date.now(),
  };
  await db
    .insertInto("ai_message_state")
    .values(row)
    .onConflict((oc) =>
      oc.column("message_id").doUpdateSet({
        text_hash: row.text_hash,
        assigned_channel_ids: row.assigned_channel_ids,
        status: row.status,
        last_error: row.last_error,
        updated_at: row.updated_at,
      }),
    )
    .execute();
}

// --- Describer (per-channel) state ------------------------------------------

export async function getChannelState(
  channelId: string,
): Promise<AiChannelStateTable | null> {
  const row = await db
    .selectFrom("ai_channel_state")
    .selectAll()
    .where("channel_id", "=", channelId)
    .executeTakeFirst();
  return row ?? null;
}

export async function saveChannelState(
  channelId: string,
  input: {
    describedAt?: number | null;
    sourceHash?: string | null;
    status: "ok" | "error";
    error?: string | null;
  },
): Promise<void> {
  const now = Date.now();
  const existing = await getChannelState(channelId);
  const row: AiChannelStateTable = {
    channel_id: channelId,
    described_at:
      input.describedAt !== undefined
        ? input.describedAt
        : (existing?.described_at ?? null),
    source_hash:
      input.sourceHash !== undefined
        ? input.sourceHash
        : (existing?.source_hash ?? null),
    status: input.status,
    last_error: input.error ?? null,
    updated_at: now,
  };
  await db
    .insertInto("ai_channel_state")
    .values(row)
    .onConflict((oc) =>
      oc.column("channel_id").doUpdateSet({
        described_at: row.described_at,
        source_hash: row.source_hash,
        status: row.status,
        last_error: row.last_error,
        updated_at: row.updated_at,
      }),
    )
    .execute();
}
