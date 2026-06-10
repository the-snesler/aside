import { z } from "zod";
import type { ReplicatedChannelDoc, ReplicatedMessageDoc } from "./types.js";

/**
 * Zod mirror of {@link ReplicatedMessageDoc} (document fields + `_deleted`). The
 * server validates every document it receives at the push boundary against this
 * before writing to SQLite — the runtime guard against client/server drift.
 */
export const messageDocSchema: z.ZodType<ReplicatedMessageDoc> = z.object({
  id: z.string().min(1).max(64),
  channelId: z.string().min(1).max(64),
  text: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  _deleted: z.boolean(),
});

/** Zod mirror of {@link ReplicatedChannelDoc}; the channel push-boundary guard. */
export const channelDocSchema: z.ZodType<ReplicatedChannelDoc> = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(64),
  createdAt: z.number(),
  updatedAt: z.number(),
  _deleted: z.boolean(),
});
