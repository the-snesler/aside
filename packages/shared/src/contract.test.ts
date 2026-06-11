import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  attachmentDocSchema,
  attachmentMigrationStrategies,
  attachmentSchema,
  channelDocSchema,
  channelMigrationStrategies,
  channelSchema,
  embedDocSchema,
  embedMigrationStrategies,
  embedSchema,
  messageDocSchema,
  messageMigrationStrategies,
  messageSchema,
} from "./index.js";
import type {
  ReplicatedAttachmentDoc,
  ReplicatedChannelDoc,
  ReplicatedEmbedDoc,
  ReplicatedMessageDoc,
} from "./types.js";

const sample: ReplicatedMessageDoc = {
  id: "message-1",
  channelId: "general",
  text: "hello",
  createdAt: 1,
  updatedAt: 2,
  _deleted: false,
};

describe("message contract", () => {
  it("keeps the RxDB schema and zod validator aligned", () => {
    const zodShape = (messageDocSchema as unknown as z.ZodObject<z.ZodRawShape>)
      .shape;
    const zodFields = Object.keys(zodShape);
    const rxFields = Object.keys(messageSchema.properties);
    const rxRequired = [...(messageSchema.required ?? [])];

    for (const field of zodFields.filter((field) => field !== "_deleted")) {
      expect(rxFields).toContain(field);
    }

    for (const field of rxRequired) {
      expect(zodFields).toContain(field);
    }

    expect(zodFields).toContain("_deleted");
    expect(rxFields).not.toContain("_deleted");
    expect(messageDocSchema.parse(sample)).toEqual(sample);
  });

  it("has a v1 identity migration from the original schema", () => {
    expect(messageSchema.version).toBe(1);
    expect(messageMigrationStrategies[1](sample)).toBe(sample);
  });
});

const channelSample: ReplicatedChannelDoc = {
  id: "channel-1",
  name: "general",
  createdAt: 1,
  updatedAt: 2,
  _deleted: false,
};

describe("channel contract", () => {
  it("keeps the RxDB schema and zod validator aligned", () => {
    const zodShape = (channelDocSchema as unknown as z.ZodObject<z.ZodRawShape>)
      .shape;
    const zodFields = Object.keys(zodShape);
    const rxFields = Object.keys(channelSchema.properties);
    const rxRequired = [...(channelSchema.required ?? [])];

    for (const field of zodFields.filter((field) => field !== "_deleted")) {
      expect(rxFields).toContain(field);
    }

    for (const field of rxRequired) {
      expect(zodFields).toContain(field);
    }

    expect(zodFields).toContain("_deleted");
    expect(rxFields).not.toContain("_deleted");
    expect(channelDocSchema.parse(channelSample)).toEqual(channelSample);
  });

  it("has a v1 identity migration from the original schema", () => {
    expect(channelSchema.version).toBe(1);
    expect(channelMigrationStrategies[1](channelSample)).toBe(channelSample);
  });
});

const embedSample: ReplicatedEmbedDoc = {
  id: "message-1:abc12345",
  messageId: "message-1",
  url: "https://example.com/article",
  title: "An article",
  description: "About things",
  image: "https://example.com/cover.png",
  siteName: "Example",
  sourceUpdatedAt: 2,
  createdAt: 1,
  updatedAt: 2,
  _deleted: false,
};

const attachmentSample: ReplicatedAttachmentDoc = {
  id: "attachment-1",
  messageId: "message-1",
  blobHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  fileName: "screenshot.png",
  mimeType: "image/png",
  size: 1024,
  createdAt: 1,
  updatedAt: 2,
  _deleted: false,
};

// A fetch that resolved only some OpenGraph fields: the optional ones are
// *absent*, never null (so the RxDB `type: "string"` props stay valid).
const sparseEmbedSample: ReplicatedEmbedDoc = {
  id: "message-2:def67890",
  messageId: "message-2",
  url: "https://example.org/",
  sourceUpdatedAt: 5,
  createdAt: 4,
  updatedAt: 5,
  _deleted: false,
};

describe("embed contract", () => {
  it("keeps the RxDB schema and zod validator aligned", () => {
    const zodShape = (embedDocSchema as unknown as z.ZodObject<z.ZodRawShape>)
      .shape;
    const zodFields = Object.keys(zodShape);
    const rxFields = Object.keys(embedSchema.properties);
    const rxRequired = [...(embedSchema.required ?? [])];

    for (const field of zodFields.filter((field) => field !== "_deleted")) {
      expect(rxFields).toContain(field);
    }

    for (const field of rxRequired) {
      expect(zodFields).toContain(field);
    }

    expect(zodFields).toContain("_deleted");
    expect(rxFields).not.toContain("_deleted");
    expect(embedDocSchema.parse(embedSample)).toEqual(embedSample);
    // Optional fields stay absent (not coerced to null/undefined keys).
    expect(embedDocSchema.parse(sparseEmbedSample)).toEqual(sparseEmbedSample);
  });

  it("is a brand-new collection at version 0 with no migrations", () => {
    expect(embedSchema.version).toBe(0);
    expect(Object.keys(embedMigrationStrategies)).toHaveLength(0);
  });
});

describe("attachment contract", () => {
  it("keeps the RxDB schema and zod validator aligned", () => {
    const zodShape = (
      attachmentDocSchema as unknown as z.ZodObject<z.ZodRawShape>
    ).shape;
    const zodFields = Object.keys(zodShape);
    const rxFields = Object.keys(attachmentSchema.properties);
    const rxRequired = [...(attachmentSchema.required ?? [])];

    for (const field of zodFields.filter((field) => field !== "_deleted")) {
      expect(rxFields).toContain(field);
    }

    for (const field of rxRequired) {
      expect(zodFields).toContain(field);
    }

    expect(zodFields).toContain("_deleted");
    expect(rxFields).not.toContain("_deleted");
    expect(attachmentDocSchema.parse(attachmentSample)).toEqual(
      attachmentSample,
    );
  });

  it("has a v1 identity migration from the original schema", () => {
    expect(attachmentSchema.version).toBe(1);
    expect(attachmentMigrationStrategies[1](attachmentSample)).toBe(
      attachmentSample,
    );
  });
});
