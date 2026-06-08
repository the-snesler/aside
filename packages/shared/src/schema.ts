import type { RxJsonSchema } from "rxdb";
import type { MessageDoc } from "./types.js";

/**
 * RxDB JSON schema for the `messages` collection. The client builds its
 * collection from this. `_deleted` is intentionally absent — RxDB manages the
 * soft-delete field itself. A string primary key must declare `maxLength`.
 */
export const messageSchema: RxJsonSchema<MessageDoc> = {
  title: "message schema",
  version: 1,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 64 },
    channelId: { type: "string", maxLength: 64 },
    text: { type: "string" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  required: ["id", "channelId", "text", "createdAt", "updatedAt"],
} as const;

export const messageMigrationStrategies = {
  1: (doc: MessageDoc) => doc,
};
