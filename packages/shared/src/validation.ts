import { z } from "zod";
import type { ReplicatedMessageDoc } from "./types.js";

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
