import type { EmbedDoc, MessageDoc } from "@aside/shared";
import { describe, expect, it } from "vitest";
import { assembleSearchDocs, buildIndex, searchNotes } from "./searchIndex";

function message(overrides: Partial<MessageDoc> = {}): MessageDoc {
  return {
    id: "message-1",
    channelIds: ["links"],
    text: "https://x.com/samnesler/status/12345",
    createdAt: 1,
    dueAt: 0,
    updatedAt: 1,
    ...overrides,
  };
}

function embed(overrides: Partial<EmbedDoc> = {}): EmbedDoc {
  return {
    id: "embed-1",
    messageId: "message-1",
    url: "https://x.com/samnesler/status/12345",
    title: "A tiny loaf note",
    description: "Sourdough timing details",
    siteName: "X",
    sourceUpdatedAt: 1,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("search index", () => {
  it("searches embed text attached to a message", () => {
    const docs = assembleSearchDocs([message()], [embed()], []);
    const results = searchNotes(buildIndex(docs), "sourdough", {
    });

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: "message-1",
      previewText: "A tiny loaf note Sourdough timing details X",
      snippetText: "A tiny loaf note Sourdough timing details X",
    });
  });

  it("keeps scoping by channel when an embed matches", () => {
    const docs = assembleSearchDocs(
      [message({ channelIds: ["links"] })],
      [embed()],
      [],
    );

    expect(
      searchNotes(buildIndex(docs), "sourdough", {
        scopeChannelId: "other",
      }),
    ).toEqual([]);
  });
});
