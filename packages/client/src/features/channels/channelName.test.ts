import { describe, expect, it } from "vitest";
import { matchChannelMention } from "./channelName";

describe("matchChannelMention", () => {
  it("matches a tag typed at the start of the line", () => {
    expect(matchChannelMention("#wor")).toEqual({ query: "wor" });
  });

  it("matches a tag typed after whitespace", () => {
    expect(matchChannelMention("ship it to #wor")).toEqual({ query: "wor" });
  });

  it("matches a bare # with an empty query", () => {
    expect(matchChannelMention("note this #")).toEqual({ query: "" });
    expect(matchChannelMention("#")).toEqual({ query: "" });
  });

  it("normalizes the query to lowercase", () => {
    expect(matchChannelMention("#Work")).toEqual({ query: "work" });
  });

  it("does not match a # in the middle of a word", () => {
    expect(matchChannelMention("foo#bar")).toBeNull();
    expect(matchChannelMention("a#")).toBeNull();
  });

  it("does not match once the tag is followed by a space", () => {
    expect(matchChannelMention("#work ")).toBeNull();
  });

  it("returns null when there is no tag before the caret", () => {
    expect(matchChannelMention("just a plain note")).toBeNull();
    expect(matchChannelMention("")).toBeNull();
  });

  it("tracks only the last tag when several are present", () => {
    expect(matchChannelMention("#done now #wo")).toEqual({ query: "wo" });
  });
});
