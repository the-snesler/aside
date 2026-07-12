import type { AttachmentDoc, ChannelDoc, MessageDoc } from "@aside/shared";
import { describe, expect, it } from "vitest";
import { notesToMarkdown } from "./markdown";

function message(overrides: Partial<MessageDoc> = {}): MessageDoc {
  return {
    id: "message-1",
    channelIds: ["general"],
    text: "hello",
    createdAt: 1,
    dueAt: 0,
    updatedAt: 2,
    ...overrides,
  };
}

function channel(overrides: Partial<ChannelDoc> = {}): ChannelDoc {
  return {
    id: "general",
    name: "general",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function attachment(overrides: Partial<AttachmentDoc> = {}): AttachmentDoc {
  return {
    id: "attachment-1",
    messageId: "message-1",
    blobHash: "abc123",
    fileName: "photo.png",
    mimeType: "image/png",
    size: 100,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("notesToMarkdown", () => {
  it("groups a multi-channel note under every channel it belongs to", () => {
    const doc = message({ channelIds: ["general", "links"] });
    const md = notesToMarkdown(
      [doc],
      [channel({ id: "general", name: "general" }), channel({ id: "links", name: "links" })],
      [],
    );

    expect(md).toContain("## #general");
    expect(md).toContain("## #links");
  });

  it("preserves message text verbatim", () => {
    const doc = message({ text: "- [ ] a task\n\n**bold**" });
    const md = notesToMarkdown([doc], [channel()], []);

    expect(md).toContain("- [ ] a task\n\n**bold**");
  });

  it("emits attachments as relative links with no token or query", () => {
    const doc = message({ id: "message-1" });
    const att = attachment({
      messageId: "message-1",
      fileName: "notes.pdf",
      blobHash: "deadbeef",
    });
    const md = notesToMarkdown([doc], [channel()], [att]);

    expect(md).toContain("- [notes.pdf](/api/blobs/deadbeef)");
    const match = /\(([^)]+)\)/.exec(md);
    expect(match?.[1]).toBe("/api/blobs/deadbeef");
    expect(match?.[1]).not.toContain("?");
    expect(match?.[1]).not.toContain("token");
  });

  it("orders channels alphabetically and messages ascending by createdAt", () => {
    const docs = [
      message({ id: "b", channelIds: ["zeta"], createdAt: 300 }),
      message({ id: "a1", channelIds: ["alpha"], createdAt: 200 }),
      message({ id: "a2", channelIds: ["alpha"], createdAt: 100 }),
    ];
    const channels = [
      channel({ id: "zeta", name: "zeta" }),
      channel({ id: "alpha", name: "alpha" }),
    ];
    const md = notesToMarkdown(docs, channels, []);

    const alphaIndex = md.indexOf("## #alpha");
    const zetaIndex = md.indexOf("## #zeta");
    expect(alphaIndex).toBeGreaterThanOrEqual(0);
    expect(alphaIndex).toBeLessThan(zetaIndex);

    const firstTimestamp = new Date(100).toISOString();
    const secondTimestamp = new Date(200).toISOString();
    expect(md.indexOf(firstTimestamp)).toBeLessThan(
      md.indexOf(secondTimestamp),
    );
  });

  it("falls back to the raw channel id when no ChannelDoc matches", () => {
    const doc = message({ channelIds: ["ghost-channel"] });
    const md = notesToMarkdown([doc], [], []);

    expect(md).toContain("## #ghost-channel");
  });

  it("returns just the title for empty input", () => {
    const md = notesToMarkdown([], [], []);

    expect(md).toBe("# Aside notes\n");
  });
});
