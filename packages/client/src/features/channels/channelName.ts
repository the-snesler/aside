/**
 * Channel names double as `#tag` handles, so they are kept slug-like. Used both
 * when creating/renaming a channel and when matching a `#tag` typed in a
 * message (CH-4).
 */
export function slugifyChannelName(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/** The first `#tag` handle in a message, normalized, or null if there isn't one. */
export function parseChannelTag(text: string): string | null {
  const match = text.match(/(?:^|\s)#([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * A `#partial` channel mention being typed at the end of `textBeforeCaret`, or
 * null. Drives the composer's autocomplete dropdown (CH-4): the `#` must start
 * the line or follow whitespace, mirroring {@link parseChannelTag}, and the
 * query may be empty (the user just typed `#`). The `#`'s column in the line is
 * `caretOffset - query.length - 1`.
 */
export function matchChannelMention(
  textBeforeCaret: string,
): { query: string } | null {
  const match = textBeforeCaret.match(/(?:^|\s)#([a-z0-9-]*)$/i);
  return match ? { query: match[1].toLowerCase() } : null;
}

/**
 * Removes the first `#tag` token (the one returned by {@link parseChannelTag})
 * from a message body and tidies the whitespace it leaves behind. Applied when a
 * note is actually routed to a channel, so the tag does not linger in the text.
 */
export function stripChannelTag(text: string, tag: string): string {
  const idx = text.toLowerCase().indexOf("#" + tag);
  if (idx === -1) return text.trim();
  const stripped = text.slice(0, idx) + text.slice(idx + 1 + tag.length);
  return stripped.replace(/\s+/g, " ").trim();
}
