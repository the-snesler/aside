import { describe, expect, it } from "vitest";
import { messageConflictHandler } from "./index.js";
import type { ReplicatedMessageDoc } from "./types.js";

const base: ReplicatedMessageDoc = {
  id: "message-1",
  channelId: "general",
  text: "hello",
  createdAt: 1,
  updatedAt: 10,
  _deleted: false,
};

describe("messageConflictHandler", () => {
  it("detects equal replicated message states", () => {
    expect(messageConflictHandler.isEqual(base, { ...base }, "test")).toBe(true);
    expect(
      messageConflictHandler.isEqual(base, { ...base, text: "changed" }, "test"),
    ).toBe(false);
  });

  it("resolves to the newer local document", async () => {
    const local = { ...base, text: "local", updatedAt: 20 };
    await expect(
      messageConflictHandler.resolve(
        { realMasterState: base, newDocumentState: local },
        "test",
      ),
    ).resolves.toEqual(local);
  });

  it("resolves to the newer remote document", async () => {
    const remote = { ...base, text: "remote", updatedAt: 20 };
    await expect(
      messageConflictHandler.resolve(
        { realMasterState: remote, newDocumentState: base },
        "test",
      ),
    ).resolves.toEqual(remote);
  });

  it("prefers deletion when timestamps tie", async () => {
    const deleted = { ...base, _deleted: true };
    await expect(
      messageConflictHandler.resolve(
        { realMasterState: base, newDocumentState: deleted },
        "test",
      ),
    ).resolves.toEqual(deleted);
  });
});
