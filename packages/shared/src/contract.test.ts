import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  messageDocSchema,
  messageMigrationStrategies,
  messageSchema,
} from "./index.js";
import type { ReplicatedMessageDoc } from "./types.js";

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
