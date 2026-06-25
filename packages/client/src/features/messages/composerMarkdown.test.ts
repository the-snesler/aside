import { describe, expect, it } from "vitest";
import { continueList, slateToString, stringToSlate } from "./composerMarkdown";

// `#tag` mentions become atomic void nodes in the Slate value but must serialize
// back to identical Markdown text, so routing/stripping and sync are unaffected.
describe("stringToSlate / slateToString round-trip", () => {
  const cases = [
    "",
    "hello world",
    "#general hello",
    "ping #team please",
    "ends with #tag",
    "#a #b adjacent",
    "line one\nline two",
    "#one\n#two",
    "no mention here",
    "a `#nothash` in code stays text",
    "- [ ] a task with #tag",
  ];
  for (const text of cases) {
    it(`round-trips ${JSON.stringify(text)}`, () => {
      expect(slateToString(stringToSlate(text))).toBe(text);
    });
  }

  it("splits a leading mention into [empty text, mention, text]", () => {
    expect(stringToSlate("#general hi")).toEqual([
      {
        type: "paragraph",
        children: [
          { text: "" },
          { type: "mention", channel: "general", children: [{ text: "" }] },
          { text: " hi" },
        ],
      },
    ]);
  });

  it("keeps `#word` mid-token (no whitespace boundary) as plain text", () => {
    // `a#b` has no boundary before `#`, so it is not a mention.
    expect(stringToSlate("a#b")).toEqual([
      { type: "paragraph", children: [{ text: "a#b" }] },
    ]);
  });
});

describe("continueList", () => {
  it("continues bullet markers", () => {
    expect(continueList("- item")).toEqual({ kind: "continue", prefix: "- " });
    expect(continueList("* item")).toEqual({ kind: "continue", prefix: "* " });
    expect(continueList("+ item")).toEqual({ kind: "continue", prefix: "+ " });
  });

  it("increments numbered markers", () => {
    expect(continueList("1. first")).toEqual({
      kind: "continue",
      prefix: "2. ",
    });
    expect(continueList("9. ninth")).toEqual({
      kind: "continue",
      prefix: "10. ",
    });
  });

  it("continues task items as unchecked", () => {
    expect(continueList("- [ ] todo")).toEqual({
      kind: "continue",
      prefix: "- [ ] ",
    });
    expect(continueList("- [x] done")).toEqual({
      kind: "continue",
      prefix: "- [ ] ",
    });
    expect(continueList("1. [X] done")).toEqual({
      kind: "continue",
      prefix: "2. [ ] ",
    });
  });

  it("preserves indentation", () => {
    expect(continueList("  - nested")).toEqual({
      kind: "continue",
      prefix: "  - ",
    });
  });

  it("exits on an empty item", () => {
    expect(continueList("- ")).toEqual({ kind: "exit" });
    expect(continueList("1. ")).toEqual({ kind: "exit" });
    expect(continueList("- [ ] ")).toEqual({ kind: "exit" });
  });

  it("returns null for non-list lines", () => {
    expect(continueList("plain text")).toBeNull();
    expect(continueList("")).toBeNull();
    expect(continueList("#general hi")).toBeNull();
  });
});
