import { describe, expect, it } from "vitest";
import { messageDocSchema } from "./index.js";
import type { ReplicatedMessageDoc } from "./types.js";

const base: ReplicatedMessageDoc = {
  id: "message-1",
  channelIds: ["general"],
  text: "hello",
  createdAt: 1,
  updatedAt: 2,
  _deleted: false,
};

describe("messageDocSchema text bound", () => {
  it("accepts an ordinary note", () => {
    expect(messageDocSchema.safeParse(base).success).toBe(true);
  });

  it("accepts text right up to the cap", () => {
    const doc = { ...base, text: "x".repeat(100_000) };
    expect(messageDocSchema.safeParse(doc).success).toBe(true);
  });

  it("rejects text past the cap", () => {
    const doc = { ...base, text: "x".repeat(100_001) };
    expect(messageDocSchema.safeParse(doc).success).toBe(false);
  });
});
