import { beforeEach, describe, expect, it, vi } from "vitest";

// Shared, mutable fixtures the module mocks read/write. `vi.hoisted` runs before
// the `vi.mock` factories (which are hoisted above the imports).
const h = vi.hoisted(() => ({
  messages: new Map<string, Record<string, unknown>>(),
  written: [] as Array<Record<string, unknown>>,
  messageState: new Map<string, Record<string, unknown>>(),
  channels: [] as Array<{
    id: string;
    name: string;
    description: string | null;
  }>,
  config: {
    organizerEnabled: true,
    provider: "anthropic",
    model: "m",
  } as Record<string, unknown>,
  classifyResult: { channelIds: [] as string[] },
}));

vi.mock("../sync/messages.js", () => ({
  messagesSync: {
    name: "messages",
    fetchById: async (id: string) => h.messages.get(id) ?? null,
  },
}));

vi.mock("../sync/server-write.js", () => ({
  writeServerBatch: async (
    _coll: unknown,
    docs: Array<Record<string, unknown>>,
  ) => {
    for (const d of docs) h.messages.set(d.id as string, d);
    h.written.push(...docs);
  },
}));

vi.mock("./config.js", () => ({
  getAiConfig: async () => h.config,
  saveAiStatus: async () => {},
}));

vi.mock("./channels.js", () => ({
  listClassifiableChannels: async () => h.channels,
}));

vi.mock("./describer.js", () => ({
  markChannelDirty: () => {},
}));

vi.mock("./provider.js", () => ({
  getModel: () => ({}),
  AiNotConfiguredError: class extends Error {},
}));

vi.mock("./state.js", () => ({
  // Identity hash: equal text → equal hash, which is all the guard needs.
  hashText: (v: string) => v,
  getMessageState: async (id: string) => h.messageState.get(id) ?? null,
  saveMessageState: async (
    id: string,
    input: { textHash: string; assignedChannelIds: string[]; status: string },
  ) => {
    h.messageState.set(id, {
      message_id: id,
      text_hash: input.textHash,
      assigned_channel_ids: JSON.stringify(input.assignedChannelIds),
      status: input.status,
    });
  },
}));

vi.mock("ai", () => ({
  generateObject: async () => ({ object: h.classifyResult }),
}));

import { processMessage } from "./organizer.js";

function seedMessage(over: Partial<Record<string, unknown>> = {}) {
  const doc = {
    id: "m1",
    channelIds: ["general"],
    text: "thoughts on LLMs",
    createdAt: 1,
    updatedAt: 5,
    _deleted: false,
    ...over,
  };
  h.messages.set(doc.id as string, doc);
  return doc;
}

describe("organizer.processMessage", () => {
  beforeEach(() => {
    h.messages.clear();
    h.messageState.clear();
    h.written.length = 0;
    h.channels = [
      { id: "c-ai", name: "ai", description: null },
      { id: "c-life", name: "life", description: null },
    ];
    h.config = { organizerEnabled: true, provider: "anthropic", model: "m" };
    h.classifyResult = { channelIds: [] };
  });

  it("adds the chosen channel without removing existing memberships", async () => {
    seedMessage();
    h.classifyResult = { channelIds: ["c-ai"] };

    await processMessage("m1");

    expect(h.written).toHaveLength(1);
    // "general" is preserved; "c-ai" is appended (add-only semantics).
    expect(h.messages.get("m1")!.channelIds).toEqual(["general", "c-ai"]);
    expect(h.messageState.get("m1")!.status).toBe("ok");
  });

  it("does not reprocess a message whose text is unchanged", async () => {
    seedMessage();
    h.classifyResult = { channelIds: ["c-ai"] };
    await processMessage("m1"); // first pass tags + records the text hash
    expect(h.written).toHaveLength(1);

    // A different classification would now pick another channel — but the text
    // hasn't changed, so the guard skips it entirely (this also breaks the
    // write→onChange loop).
    h.classifyResult = { channelIds: ["c-life"] };
    await processMessage("m1");

    expect(h.written).toHaveLength(1);
    expect(h.messages.get("m1")!.channelIds).toEqual(["general", "c-ai"]);
  });

  it("does not re-add a tag the user removed (text unchanged)", async () => {
    // Message was organized before (state hash == current text), but the user
    // has since stripped the AI tag back to just "general".
    seedMessage({ channelIds: ["general"], updatedAt: 9 });
    h.messageState.set("m1", {
      message_id: "m1",
      text_hash: "thoughts on LLMs",
      assigned_channel_ids: JSON.stringify(["c-ai"]),
      status: "ok",
    });
    h.classifyResult = { channelIds: ["c-ai"] };

    await processMessage("m1");

    expect(h.written).toHaveLength(0);
    expect(h.messages.get("m1")!.channelIds).toEqual(["general"]);
  });

  it("writes nothing when no channel fits, but records the pass", async () => {
    seedMessage();
    h.classifyResult = { channelIds: [] };

    await processMessage("m1");

    expect(h.written).toHaveLength(0);
    expect(h.messages.get("m1")!.channelIds).toEqual(["general"]);
    expect(h.messageState.get("m1")!.status).toBe("ok");
  });

  it("ignores channel ids the model invents (not in the candidate list)", async () => {
    seedMessage();
    h.classifyResult = { channelIds: ["c-nonexistent"] };

    await processMessage("m1");

    expect(h.written).toHaveLength(0);
    expect(h.messages.get("m1")!.channelIds).toEqual(["general"]);
  });
});
