/** At most this many previews per message — keeps a link-dump note from fanning
 * out into dozens of fetches. */
export const MAX_URLS_PER_MESSAGE = 3;

// http(s) URLs, stopping at whitespace and the delimiters that wrap a URL in
// Markdown ("[text](url)", "<url>") or prose. Excluding ")"/"]" means a URL that
// genuinely contains them (rare — e.g. some Wikipedia links) is truncated; that
// trade keeps Markdown-link and bare-URL extraction simple and correct for the
// common case.
const URL_RE = /https?:\/\/[^\s<>()[\]"'`]+/gi;

/**
 * Pulls the distinct http(s) URLs out of a message body (Markdown). Returns them
 * in first-seen order, trailing sentence punctuation stripped, capped at
 * {@link MAX_URLS_PER_MESSAGE}. The server uses this to decide which messages
 * warrant an OpenGraph fetch.
 */
export function extractUrls(text: string): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const match of text.matchAll(URL_RE)) {
    const url = match[0].replace(/[.,;:!?]+$/, "");
    if (seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_URLS_PER_MESSAGE) break;
  }
  return urls;
}
