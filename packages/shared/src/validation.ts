import { z } from "zod";
import type {
  ReplicatedAttachmentDoc,
  ReplicatedChannelDoc,
  ReplicatedEmbedDoc,
  ReplicatedMessageDoc,
} from "./types.js";

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

/**
 * Zod mirror of {@link ReplicatedEmbedDoc}. The OpenGraph fields are optional —
 * absent (never `null`) when a fetch didn't yield them — matching the RxDB
 * schema where they sit outside `required`.
 */
export const embedDocSchema: z.ZodType<ReplicatedEmbedDoc> = z.object({
  id: z.string().min(1).max(128),
  messageId: z.string().min(1).max(64),
  url: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
  siteName: z.string().optional(),
  sourceUpdatedAt: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
  _deleted: z.boolean(),
});

/** Zod mirror of {@link ReplicatedAttachmentDoc}; the attachment push-boundary guard. */
export const attachmentDocSchema: z.ZodType<ReplicatedAttachmentDoc> = z.object(
  {
    id: z.string().min(1).max(64),
    messageId: z.string().min(1).max(64),
    blobHash: z.string().min(1).max(64),
    fileName: z.string().min(1).max(512),
    mimeType: z.string().min(1).max(128),
    size: z.number().int().nonnegative(),
    createdAt: z.number(),
    updatedAt: z.number(),
    _deleted: z.boolean(),
  },
);
