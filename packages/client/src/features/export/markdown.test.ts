import type { AttachmentDoc, ChannelDoc, MessageDoc } from "@aside/shared";
import { describe, expect, it } from "vitest";
import { notesToMarkdownFiles } from "./markdown";

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

describe("notesToMarkdownFiles", () => {
  it("writes a multi-channel note once per channel folder, same id", () => {
    const doc = message({ id: "message-1", channelIds: ["general", "links"] });
    const files = notesToMarkdownFiles(
      [doc],
      [
        channel({ id: "general", name: "general" }),
        channel({ id: "links", name: "links" }),
      ],
      [],
    );

    expect(files.map((f) => f.path)).toEqual([
      "general/message-1.md",
      "links/message-1.md",
    ]);
    expect(files[0].content).toBe(files[1].content);
  });

  it("puts id, ISO date, and every channel name in the frontmatter", () => {
    const doc = message({
      id: "message-1",
      channelIds: ["general", "links"],
      createdAt: 12345,
    });
    const [file] = notesToMarkdownFiles(
      [doc],
      [
        channel({ id: "general", name: "general" }),
        channel({ id: "links", name: "links" }),
      ],
      [],
    );

    expect(file.content).toContain('id: "message-1"');
    expect(file.content).toContain(`date: "${new Date(12345).toISOString()}"`);
    expect(file.content).toContain('channels: ["general", "links"]');
  });

  it("preserves message text verbatim", () => {
    const doc = message({ text: "- [ ] a task\n\n**bold**" });
    const [file] = notesToMarkdownFiles([doc], [channel()], []);

    expect(file.content).toContain("- [ ] a task\n\n**bold**");
  });

  it("emits attachments as relative links with no token or query", () => {
    const doc = message({ id: "message-1" });
    const att = attachment({
      messageId: "message-1",
      fileName: "notes.pdf",
      blobHash: "deadbeef",
    });
    const [file] = notesToMarkdownFiles([doc], [channel()], [att]);

    expect(file.content).toContain("- [notes.pdf](/api/blobs/deadbeef)");
    const match = /\(([^)]+)\)/.exec(file.content);
    expect(match?.[1]).toBe("/api/blobs/deadbeef");
    expect(match?.[1]).not.toContain("?");
    expect(match?.[1]).not.toContain("token");
  });

  it("names the file after the note id", () => {
    const doc = message({ id: "a1b2c3", channelIds: ["general"] });
    const files = notesToMarkdownFiles([doc], [channel()], []);

    expect(files).toEqual([
      { path: "general/a1b2c3.md", content: expect.any(String) },
    ]);
  });

  it("sorts files by path (folder, then filename)", () => {
    const docs = [
      message({ id: "b", channelIds: ["zeta"], createdAt: 300 }),
      message({ id: "a1", channelIds: ["alpha"], createdAt: 200 }),
      message({ id: "a2", channelIds: ["alpha"], createdAt: 100 }),
    ];
    const channels = [
      channel({ id: "zeta", name: "zeta" }),
      channel({ id: "alpha", name: "alpha" }),
    ];
    const files = notesToMarkdownFiles(docs, channels, []);

    expect(files.map((f) => f.path)).toEqual([
      "alpha/a1.md",
      "alpha/a2.md",
      "zeta/b.md",
    ]);
  });

  it("falls back to the raw channel id as folder when no ChannelDoc matches", () => {
    const doc = message({ channelIds: ["ghost-channel"] });
    const files = notesToMarkdownFiles([doc], [], []);

    expect(files.map((f) => f.path)).toEqual(["ghost-channel/message-1.md"]);
    expect(files[0].content).toContain('channels: ["ghost-channel"]');
  });

  it("de-duplicates folders when two channel names slugify the same", () => {
    const docs = [
      message({ id: "a", channelIds: ["c1"] }),
      message({ id: "b", channelIds: ["c2"] }),
    ];
    const channels = [
      channel({ id: "c1", name: "Q&A" }),
      channel({ id: "c2", name: "Q!A" }),
    ];
    const files = notesToMarkdownFiles(docs, channels, []);

    const folders = new Set(files.map((f) => f.path.split("/")[0]));
    expect(folders.size).toBe(2);
  });

  it("returns no files for empty input", () => {
    const files = notesToMarkdownFiles([], [], []);

    expect(files).toEqual([]);
  });
});
