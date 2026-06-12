import type { RxJsonSchema } from "rxdb";
import type {
  AttachmentDoc,
  ChannelDoc,
  ConfigDoc,
  EmbedDoc,
  MessageDoc,
} from "./types.js";

/**
 * RxDB JSON schema for the `messages` collection. The client builds its
 * collection from this. `_deleted` is intentionally absent — RxDB manages the
 * soft-delete field itself. A string primary key must declare `maxLength`.
 */
export const messageSchema: RxJsonSchema<MessageDoc> = {
  title: "message schema",
  version: 2,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 64 },
    channelId: { type: "string", maxLength: 64 },
    text: { type: "string" },
    createdAt: {
      type: "number",
      minimum: 0,
      maximum: 9007199254740991,
      multipleOf: 1,
    },
    updatedAt: { type: "number" },
  },
  required: ["id", "channelId", "text", "createdAt", "updatedAt"],
  indexes: ["createdAt", ["channelId", "createdAt"]],
} as const;

export const messageMigrationStrategies = {
  1: (doc: MessageDoc) => doc,
  2: (doc: MessageDoc) => doc,
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
  required: [
    "id",
    "messageId",
    "url",
    "sourceUpdatedAt",
    "createdAt",
    "updatedAt",
  ],
} as const;

export const embedMigrationStrategies = {};

/**
 * RxDB JSON schema for the `attachments` collection. Mirrors the others:
 * `_deleted` is RxDB-owned (absent here) and every string field declares a
 * `maxLength`. `blobHash` is a 64-char sha256 hex digest.
 */
export const attachmentSchema: RxJsonSchema<AttachmentDoc> = {
  title: "attachment schema",
  version: 1,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 64 },
    messageId: { type: "string", maxLength: 64 },
    blobHash: { type: "string", maxLength: 64 },
    fileName: { type: "string", maxLength: 512 },
    mimeType: { type: "string", maxLength: 128 },
    size: { type: "number" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  required: [
    "id",
    "messageId",
    "blobHash",
    "fileName",
    "mimeType",
    "size",
    "createdAt",
    "updatedAt",
  ],
} as const;

export const attachmentMigrationStrategies = {
  1: (doc: AttachmentDoc) => doc,
};

/**
 * RxDB JSON schema for the `config` collection — a small synced key-value store
 * (today: the UI theme). `value` is an opaque JSON string, so the schema stays
 * trivial and new settings need no migration. Mirrors the others: `_deleted` is
 * RxDB-owned (absent) and the string primary key declares `maxLength`.
 */
export const configSchema: RxJsonSchema<ConfigDoc> = {
  title: "config schema",
  version: 0,
  primaryKey: "id",
  type: "object",
  properties: {
    id: { type: "string", maxLength: 64 },
    value: { type: "string" },
    createdAt: { type: "number" },
    updatedAt: { type: "number" },
  },
  required: ["id", "value", "createdAt", "updatedAt"],
} as const;

export const configMigrationStrategies = {};
