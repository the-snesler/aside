import { describe, expect, it } from "vitest";
import { extractUrls, MAX_URLS_PER_MESSAGE } from "./extract.js";

describe("extractUrls", () => {
  it("finds a bare URL", () => {
    expect(extractUrls("see https://example.com for more")).toEqual([
      "https://example.com",
    ]);
  });

  it("finds the URL inside a Markdown link", () => {
    expect(extractUrls("read [the docs](https://example.com/docs)")).toEqual([
      "https://example.com/docs",
    ]);
  });

  it("strips trailing sentence punctuation", () => {
    expect(extractUrls("go to https://example.com.")).toEqual([
      "https://example.com",
    ]);
    expect(extractUrls("(https://example.com)")).toEqual([
      "https://example.com",
    ]);
  });

  it("dedupes repeated URLs, preserving first-seen order", () => {
    expect(
      extractUrls("https://b.com then https://a.com then https://b.com"),
    ).toEqual(["https://b.com", "https://a.com"]);
  });

  it("caps the number of URLs", () => {
    const text = Array.from(
      { length: MAX_URLS_PER_MESSAGE + 2 },
      (_, i) => `https://site${i}.com`,
    ).join(" ");
    expect(extractUrls(text)).toHaveLength(MAX_URLS_PER_MESSAGE);
  });

  it("ignores non-http(s) and returns empty when there's no URL", () => {
    expect(extractUrls("plain note, ftp://nope.com mailto:a@b.com")).toEqual(
      [],
    );
  });
});
