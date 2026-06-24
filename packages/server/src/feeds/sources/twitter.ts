import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import puppeteer, { type CookieParam, type Page } from "puppeteer";
import { FeedAuthError } from "../errors.js";
import { feedDir } from "../paths.js";
import type {
  FeedConfig,
  FeedFetchResult,
  FeedItem,
  FeedSource,
} from "../types.js";

const BOOKMARKS_URL = "https://x.com/i/bookmarks";
const SCROLL_INTERVAL_MS = 1500;
/** Stop after this many scrolls with no height change (end of list reached). */
const STABLE_TICKS_TO_STOP = 5;
/** Hard cap on scroll iterations, so a misbehaving page can't loop forever. */
const MAX_SCROLLS = 500;
const DEFAULT_MAX_ITEMS = 200;
/** Captures username + tweet id from an X status href. */
const STATUS_RE = /\/([^/]+)\/status\/(\d+)/;

/** Raw fields pulled from each tweet article in the page context. */
export interface RawTweet {
  href: string | null;
  datetime: string | null;
}

/**
 * Twitter/X bookmarks via a persistent Puppeteer profile. Adapts
 * github.com/fastorder/twitter-bookmark-export: seed cookies once, navigate to
 * the bookmarks page, auto-scroll, scrape the tweet articles, and resume at the
 * last-seen permalink. The profile (under the data volume) keeps the X session
 * warm across runs, so re-auth is rare.
 */
export const twitterBookmarksSource: FeedSource = {
  type: "twitter-bookmarks",
  idPrefix: "tw",

  async fetchItems(feed: FeedConfig): Promise<FeedFetchResult> {
    const dir = feedDir(feed.id);
    mkdirSync(dir, { recursive: true });
    const profileDir = join(dir, "profile");
    const maxItems = numberOption(feed.options.maxItems, DEFAULT_MAX_ITEMS);
    const stopAtUrl =
      typeof feed.cursor?.lastUrl === "string" ? feed.cursor.lastUrl : null;

    const browser = await puppeteer.launch({
      headless: true,
      userDataDir: profileDir,
      // --no-sandbox/dev-shm flags are required to run Chromium as root in the
      // container; harmless in local dev.
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    try {
      const page = await browser.newPage();
      await seedCookiesIfPresent(page, dir);

      await page.goto(BOOKMARKS_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      // Either tweets render, or we get bounced to login. networkidle is
      // unreliable on X (it long-polls), so wait on the content selector.
      await page
        .waitForSelector('article[data-testid="tweet"]', { timeout: 20_000 })
        .catch(() => undefined);

      if (isLoggedOut(page.url())) {
        throw new FeedAuthError(
          "X session is not authenticated — re-seed cookies for this feed.",
        );
      }

      const items = await scrapeBookmarks(page, { maxItems, stopAtUrl });
      // Newest bookmark sits at the top; remember it so the next run stops there.
      const lastUrl = items[0]?.url ?? stopAtUrl ?? null;
      return { items, cursor: { lastUrl } };
    } finally {
      await browser.close();
    }
  },
};

async function scrapeBookmarks(
  page: Page,
  opts: { maxItems: number; stopAtUrl: string | null },
): Promise<FeedItem[]> {
  const seen = new Set<string>();
  const items: FeedItem[] = [];
  let stable = 0;
  let lastHeight = -1;
  let reachedCursor = false;

  for (
    let i = 0;
    i < MAX_SCROLLS && !reachedCursor && items.length < opts.maxItems;
    i++
  ) {
    const raws = await extractVisible(page);
    for (const raw of raws) {
      const item = normalizeTweet(raw);
      if (!item) continue;
      if (opts.stopAtUrl && item.url === opts.stopAtUrl) {
        reachedCursor = true;
        break;
      }
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      items.push(item);
      if (items.length >= opts.maxItems) break;
    }
    if (reachedCursor || items.length >= opts.maxItems) break;

    const height = await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
      return document.body.scrollHeight;
    });
    if (height === lastHeight) {
      stable += 1;
      if (stable >= STABLE_TICKS_TO_STOP) break;
    } else {
      stable = 0;
      lastHeight = height;
    }
    await sleep(SCROLL_INTERVAL_MS);
  }

  return items;
}

function extractVisible(page: Page): Promise<RawTweet[]> {
  return page.$$eval('article[data-testid="tweet"]', (articles) =>
    articles.map((article) => {
      // The permalink wrapping the timestamp is the main tweet's canonical link
      // (avoids picking up a quoted tweet's status link).
      const permalink =
        article.querySelector('a[href*="/status/"]:has(time)') ??
        article.querySelector('a[href*="/status/"]');
      const timeEl = article.querySelector("time");
      return {
        href: permalink?.getAttribute("href") ?? null,
        datetime: timeEl?.getAttribute("datetime") ?? null,
      };
    }),
  );
}

export function normalizeTweet(raw: RawTweet): FeedItem | null {
  if (!raw.href) return null;
  const match = raw.href.match(STATUS_RE);
  if (!match) return null;
  const externalId = match[2];
  const url = `https://x.com/${match[1]}/status/${externalId}`;
  const parsed = raw.datetime ? Date.parse(raw.datetime) : NaN;
  const createdAt = Number.isNaN(parsed) ? Date.now() : parsed;
  return { externalId, url, text: url, createdAt };
}

/**
 * Seeds cookies (exported by a browser extension) into the persistent profile,
 * then deletes the file so it isn't re-imported — after this the profile keeps
 * the session itself. Tolerant of the common extension export shapes
 * (`expirationDate`, lowercase/`no_restriction` sameSite, `partitionKey`).
 */
async function seedCookiesIfPresent(page: Page, dir: string): Promise<void> {
  const cookiesPath = join(dir, "cookies.json");
  if (!existsSync(cookiesPath)) return;

  const parsed: unknown = JSON.parse(readFileSync(cookiesPath, "utf8"));
  if (!Array.isArray(parsed)) {
    rmSync(cookiesPath, { force: true });
    return;
  }

  const cookies = parsed
    .map((raw) => toCookieParam(raw as Record<string, unknown>))
    .filter((c): c is CookieParam => c !== null);
  if (cookies.length > 0) await page.setCookie(...cookies);
  rmSync(cookiesPath, { force: true });
}

function toCookieParam(raw: Record<string, unknown>): CookieParam | null {
  const name = typeof raw.name === "string" ? raw.name : null;
  const value = typeof raw.value === "string" ? raw.value : null;
  if (!name || value === null) return null;

  const param: CookieParam = { name, value };
  if (typeof raw.domain === "string") param.domain = raw.domain;
  if (typeof raw.path === "string") param.path = raw.path;
  if (typeof raw.secure === "boolean") param.secure = raw.secure;
  if (typeof raw.httpOnly === "boolean") param.httpOnly = raw.httpOnly;

  const expires = raw.expires ?? raw.expirationDate;
  if (typeof expires === "number") param.expires = Math.floor(expires);

  const sameSite = normalizeSameSite(raw.sameSite);
  if (sameSite) param.sameSite = sameSite;
  return param;
}

function normalizeSameSite(
  value: unknown,
): "Strict" | "Lax" | "None" | undefined {
  if (typeof value !== "string") return undefined;
  switch (value.toLowerCase()) {
    case "strict":
      return "Strict";
    case "lax":
      return "Lax";
    case "none":
    case "no_restriction":
      return "None";
    default:
      return undefined;
  }
}

function numberOption(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * A logged-in session stays on the bookmarks path; logged-out gets redirected
 * to a login/onboarding flow (carrying `redirect_after_login`). Anything off the
 * bookmarks path means we need fresh cookies. (A logged-in account with zero
 * bookmarks still resolves on `/i/bookmarks`, so it reads as authenticated.)
 */
function isLoggedOut(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.searchParams.has("redirect_after_login")) return true;
    return !parsed.pathname.startsWith("/i/bookmarks");
  } catch {
    return /redirect_after_login|\/(login|logout)/.test(url);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
