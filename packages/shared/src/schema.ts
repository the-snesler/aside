import type { RxJsonSchema } from "rxdb";
import type { ChannelDoc, EmbedDoc, MessageDoc } from "./types.js";

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

/**
 * RxDB JSON schema for the `channels` collection. Mirrors {@link messageSchema}:
 * `_deleted` is absent (RxDB-owned) and the string primary key declares
 * `maxLength`.
 */
export const channelSchema: RxJsonSchema<ChannelDoc> = {
  title: "channel schema",
  version: 1,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 64 },
    name: { type: "string", maxLength: 64 },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  required: ["id", "name", "createdAt", "updatedAt"],
} as const;

export const channelMigrationStrategies = {
  1: (doc: ChannelDoc) => doc,
};

/**
 * RxDB JSON schema for the `embeds` collection. A brand-new collection, so it
 * starts at version 0 with no migration strategies. The OpenGraph fields are
 * optional (a fetch may yield only some of them) and so are absent from
 * `required`; when a column is null the server omits the field entirely rather
 * than sending `null`, which keeps these `type: "string"` properties valid.
 *
 * `id` is `${messageId}:${shortHash(url)}`, so it can run longer than a bare id
 * — hence a roomier `maxLength` than the other collections' 64.
 */
export const embedSchema: RxJsonSchema<EmbedDoc> = {
  title: "embed schema",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 128 },
    messageId: { type: "string", maxLength: 64 },
    url: { type: "string" },
    title: { type: "string" },
    description: { type: "string" },
    image: { type: "string" },
    siteName: { type: "string" },
    sourceUpdatedAt: { type: "number" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  required: ["id", "messageId", "url", "sourceUpdatedAt", "createdAt", "updatedAt"],
} as const;

export const embedMigrationStrategies = {};
