import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import ogs from "open-graph-scraper";

/** Normalized OpenGraph result we persist and sync. `url` is always set; the
 * rest are present only when the page provided them. */
export interface OgResult {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

/** A fetch/guard failure, distinct from "fetched fine but no preview data". */
export class OgFetchError extends Error {}

const FETCH_TIMEOUT_MS = 8000;
// OpenGraph tags live in <head>; 1 MiB is far more than enough and caps a
// hostile/huge page.
const MAX_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;
const USER_AGENT = "AsideBot/1.0 (+local-first link preview)";

/**
 * Fetches a URL and parses its OpenGraph metadata (OG-1). We do the HTTP fetch
 * ourselves — rather than letting open-graph-scraper fetch — so we control the
 * SSRF guard, timeout, response-size cap, content-type check, and re-validate
 * the destination on every redirect hop; `ogs` is used only to parse the HTML.
 *
 * Throws {@link OgFetchError} on a guard/network/parse failure (the caller
 * negative-caches those). Resolves to an {@link OgResult} on success, which may
 * still be sparse if the page exposed few tags.
 *
 * SSRF note: the public-IP check resolves the hostname and rejects private
 * ranges, but resolve-then-connect leaves a narrow DNS-rebinding window. For a
 * single-user self-hosted server fetching links the user (or their feeds) chose,
 * that residual risk is accepted.
 */
export async function fetchOpenGraph(url: string): Promise<OgResult> {
  const { html, finalUrl } = await fetchHtml(url);

  // Parse only — we already did the (guarded) fetch, so pass `html` alone; ogs
  // rejects if given both `url` and `html`. It also rejects when a page exposes
  // no metadata, so salvage whatever partial `result` it attached and let the
  // <title> fallback below cover the rest.
  let parsed: Record<string, unknown> = {};
  try {
    const { result } = await ogs({ html });
    parsed = result as Record<string, unknown>;
  } catch (err) {
    const salvaged = (err as { result?: unknown })?.result;
    if (salvaged && typeof salvaged === "object") {
      parsed = salvaged as Record<string, unknown>;
    }
  }

  const title =
    str(parsed.ogTitle) ?? str(parsed.twitterTitle) ?? htmlTitle(html);
  const description =
    str(parsed.ogDescription) ?? str(parsed.twitterDescription);
  const image = resolveImage(
    firstImage(parsed.ogImage) ?? firstImage(parsed.twitterImage),
    finalUrl,
  );
  const siteName = str(parsed.ogSiteName);

  return {
    url: str(parsed.ogUrl) ?? finalUrl,
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(image ? { image } : {}),
    ...(siteName ? { siteName } : {}),
  };
}

/** Did the fetch yield anything worth rendering as a card? */
export function hasPreview(result: OgResult): boolean {
  return Boolean(result.title || result.image);
}

/** Fetches HTML with manual, re-validated redirects + a streamed byte cap. */
async function fetchHtml(
  initialUrl: string,
): Promise<{ html: string; finalUrl: string }> {
  let url = initialUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(url);

    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "user-agent": USER_AGENT,
          accept: "text/html,application/xhtml+xml",
        },
      });
    } catch (err) {
      throw new OgFetchError(
        `fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location)
        throw new OgFetchError(`redirect ${res.status} without location`);
      await res.body?.cancel().catch(() => {});
      url = new URL(location, url).toString();
      continue;
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => {});
      throw new OgFetchError(`HTTP ${res.status}`);
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
      await res.body?.cancel().catch(() => {});
      throw new OgFetchError(
        `unsupported content-type: ${contentType || "none"}`,
      );
    }

    return { html: await readCapped(res), finalUrl: url };
  }
  throw new OgFetchError("too many redirects");
}

/** Reads the response body up to MAX_BYTES, then stops — <head> is all we need. */
async function readCapped(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const remaining = MAX_BYTES - total;
      if (value.length >= remaining) {
        chunks.push(value.subarray(0, remaining));
        break;
      }
      chunks.push(value);
      total += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Rejects non-http(s) URLs and hostnames that resolve to a non-public address. */
async function assertPublicUrl(raw: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new OgFetchError(`invalid URL: ${raw}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new OgFetchError(`unsupported protocol: ${parsed.protocol}`);
  }

  const host = parsed.hostname;
  const addresses = isIP(host)
    ? [host]
    : (await resolveHost(host)).map((entry) => entry.address);

  if (addresses.length === 0)
    throw new OgFetchError(`could not resolve ${host}`);
  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new OgFetchError(`refusing to fetch private address ${address}`);
    }
  }
}

async function resolveHost(host: string): Promise<Array<{ address: string }>> {
  try {
    return await lookup(host, { all: true });
  } catch {
    throw new OgFetchError(`could not resolve ${host}`);
  }
}

/** True for loopback, private, link-local, ULA, CGNAT, multicast/reserved ranges. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isBlockedV4(ip);
  if (family === 6) return isBlockedV6(ip);
  return true; // not a parseable IP — refuse
}

function isBlockedV4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (
    parts.length !== 4 ||
    parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)
  ) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // this-net, private, loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 + 192.0.2.0/24
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isBlockedV6(ip: string): boolean {
  const addr = ip.toLowerCase();
  if (addr === "::1" || addr === "::") return true; // loopback, unspecified
  // IPv4-mapped/-compatible (::ffff:a.b.c.d) — check the embedded v4.
  const mapped = addr.match(/(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  if (addr.startsWith("fc") || addr.startsWith("fd")) return true; // ULA fc00::/7
  if (/^fe[89ab]/.test(addr)) return true; // link-local fe80::/10
  if (addr.startsWith("ff")) return true; // multicast
  return false;
}

// --- small parsing helpers -------------------------------------------------

function str(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** og:image / twitter:image come back as an array of objects, an object, or a
 * bare string depending on the page; pull the first usable url out. */
function firstImage(value: unknown): string | undefined {
  if (!value) return undefined;
  const entry = Array.isArray(value) ? value[0] : value;
  if (typeof entry === "string") return str(entry);
  if (entry && typeof entry === "object" && "url" in entry) {
    return str((entry as { url: unknown }).url);
  }
  return undefined;
}

/** Resolves a possibly-relative image URL against the page and keeps only http(s). */
function resolveImage(
  image: string | undefined,
  base: string,
): string | undefined {
  if (!image) return undefined;
  try {
    const resolved = new URL(image, base);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return undefined;
    }
    return resolved.toString();
  } catch {
    return undefined;
  }
}

/** Last-resort title from the <title> tag when no og/twitter title is present. */
function htmlTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return match ? str(decodeEntities(match[1])) : undefined;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
