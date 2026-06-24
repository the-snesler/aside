import { Text, type BaseEditor, type Descendant } from "slate";
import type { HistoryEditor } from "slate-history";
import type { ReactEditor } from "slate-react";

// The composer's document model (MD-2 / CH-4). The wire contract stays a plain
// Markdown string — these helpers are the only bridge between that string and
// the Slate value. A `#channel` mention is the one structural element: it lives
// as an atomic inline void node while editing, but serializes back to `#name`
// text so routing/stripping (MessageList) and sync are unaffected.

export type FormattedText = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  title?: boolean;
  url?: boolean;
  blockquote?: boolean;
  list?: boolean;
  punctuation?: boolean;
  mention?: boolean;
  reminder?: boolean;
};

/** An atomic `#channel` chip: an inline void node carrying just the bare name. */
export type MentionElement = {
  type: "mention";
  channel: string;
  children: FormattedText[];
};

export type ParagraphElement = {
  type: "paragraph";
  children: (FormattedText | MentionElement)[];
};

declare module "slate" {
  interface CustomTypes {
    Editor: BaseEditor & ReactEditor & HistoryEditor;
    Element: ParagraphElement | MentionElement;
    Text: FormattedText;
  }
}

// A `#tag` mention: `#` must start the line or follow whitespace (mirrors
// parseChannelTag / matchChannelMention), then a slug-like name. The boundary
// char is captured so we can keep it in the surrounding text node.
const MENTION_RE = /(^|\s)#([a-z0-9-]+)/g;

/** Split one line into interleaved text + mention nodes (text always at the edges). */
function lineToChildren(line: string): (FormattedText | MentionElement)[] {
  const children: (FormattedText | MentionElement)[] = [];
  let lastIndex = 0;
  MENTION_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MENTION_RE.exec(line)) !== null) {
    const boundary = match[1]; // "" (line start) or a whitespace char
    const name = match[2];
    const hashIndex = match.index + boundary.length;
    // Text before the `#` (includes the boundary char, e.g. the leading space).
    children.push({ text: line.slice(lastIndex, hashIndex) });
    children.push({ type: "mention", channel: name, children: [{ text: "" }] });
    lastIndex = MENTION_RE.lastIndex;
  }
  children.push({ text: line.slice(lastIndex) });
  return children;
}

/** A Markdown string → Slate value: one paragraph per line, `#tag` → mention. */
export function stringToSlate(text: string): Descendant[] {
  const lines = text.length ? text.split("\n") : [""];
  return lines.map((line) => ({
    type: "paragraph" as const,
    children: lineToChildren(line),
  }));
}

/** The serialized text of one node: mentions become `#name`, voids' "" drops out. */
function nodeText(node: Descendant): string {
  if (Text.isText(node)) return node.text;
  if (node.type === "mention") return `#${node.channel}`;
  return node.children.map(nodeText).join("");
}

/** Slate value → Markdown string. Exact inverse of {@link stringToSlate}. */
export function slateToString(nodes: Descendant[]): string {
  return nodes.map(nodeText).join("\n");
}

export type ListContinuation =
  | { kind: "continue"; prefix: string }
  | { kind: "exit" }
  | null;

// Leading list marker: indent, a bullet (`-`/`*`/`+`) or `n.`, the gap, an
// optional GFM task box, then the item's content.
const LIST_RE = /^(\s*)([-*+]|\d+\.)(\s+)(\[[ xX]\]\s+)?(.*)$/;

/**
 * Markdown-shortcut list continuation (the Slate markdown-shortcuts example,
 * adapted to raw Markdown). Given the current line, decide what an inserted
 * break should do:
 *  - `continue` — the line is a non-empty list item; the next line should repeat
 *    the marker (numbered markers increment; a task item continues unchecked).
 *  - `exit` — the line is an empty item; the caller clears the marker instead of
 *    extending the list.
 *  - `null` — not a list line; insert a plain break.
 */
export function continueList(line: string): ListContinuation {
  const match = LIST_RE.exec(line);
  if (!match) return null;
  const [, indent, marker, gap, checkbox, content] = match;
  if (content.trim() === "") return { kind: "exit" };
  let nextMarker = marker;
  if (/^\d+\.$/.test(marker)) {
    nextMarker = `${parseInt(marker, 10) + 1}.`;
  }
  const nextCheckbox = checkbox ? "[ ] " : "";
  return {
    kind: "continue",
    prefix: `${indent}${nextMarker}${gap}${nextCheckbox}`,
  };
}
