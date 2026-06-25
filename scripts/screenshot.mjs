#!/usr/bin/env node
/**
 * Opens the running Aside client in headless Chromium, logs in if needed, and
 * saves a screenshot — so an agent doesn't have to hand-roll Playwright just to
 * see what's on screen after a change.
 *
 * Expects the dev server (and ideally `scripts/seed.mjs`) to already be
 * running; this only drives the browser.
 *
 * Usage:   node scripts/screenshot.mjs [output-path]
 * Env:     ASIDE_CLIENT_URL  default http://localhost:5173
 *          ASIDE_PASSWORD    default "admin" (matches the CLAUDE.md dev convention)
 */

import { chromium } from "playwright";

const CLIENT_URL = process.env.ASIDE_CLIENT_URL ?? "http://localhost:5173";
const PASSWORD = process.env.ASIDE_PASSWORD ?? "admin";
const OUTPUT_PATH = process.argv[2] ?? "scripts/screenshot.png";
const COMPOSER = '[contenteditable="true"]';
const EMPTY_STATE_TEXT = /no notes (here|in this channel) yet/i;
const MAX_RELOADS = 2;

async function main() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    });

    // Aside opens an SSE connection per collection as soon as it's authed, which
    // never goes idle — so "networkidle" would hang. "load" plus explicit
    // element waits is the reliable signal here.
    await page.goto(CLIENT_URL, { waitUntil: "load" });
    await login(page);
    await page.locator(COMPOSER).first().waitFor({ timeout: 15_000 });
    await waitForListToSettle(page);

    // A brand-new browser profile's first mount races RxDB's initial
    // replication pull: the message list loads from local storage once on
    // mount, and if that fires before historical notes have synced in, it
    // never retries — so a cold profile can get stuck showing "no notes" even
    // after the data has landed locally a moment later. Reloading re-mounts
    // against the now-warmer local copy; retry a couple of times in case the
    // sync itself is still catching up.
    for (
      let attempt = 0;
      attempt < MAX_RELOADS && !(await hasNotes(page));
      attempt++
    ) {
      await page.reload({ waitUntil: "load" });
      await page.locator(COMPOSER).first().waitFor({ timeout: 15_000 });
      await waitForListToSettle(page);
    }

    await page.screenshot({ path: OUTPUT_PATH, fullPage: false });
    console.log(`Saved screenshot to ${OUTPUT_PATH}`);
  } finally {
    await browser.close();
  }
}

/** Fills + submits the password screen if one is showing; no-op otherwise. */
async function login(page) {
  // `isVisible()` checks the DOM once and does not actually wait despite
  // accepting a `timeout` option, so use `waitFor` (a real actionability
  // wait) wherever "is this here yet" matters.
  const passwordInput = page.locator('input[type="password"]');
  const sawPasswordInput = await passwordInput
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (!sawPasswordInput) return;

  await passwordInput.fill(PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Login error means setup is done and the password is something else.
  const loginFailed = await page
    .getByText(/incorrect password|could not create password/i)
    .waitFor({ state: "visible", timeout: 3000 })
    .then(() => true)
    .catch(() => false);
  if (loginFailed) {
    throw new Error(
      `Login failed with password "${PASSWORD}". Set ASIDE_PASSWORD to match the ` +
        "owner password, or run scripts/seed.mjs first to claim it.",
    );
  }
}

// Scoped to <main> (the message pane): channel sidebar entries are also
// draggable (for reordering), so an unscoped selector would match those too.
function noteRow(page) {
  return page.locator('main [draggable="true"]').first();
}

/** Waits for the message list's first load attempt to resolve, one way or another. */
async function waitForListToSettle(page) {
  await noteRow(page)
    .or(page.getByText(EMPTY_STATE_TEXT))
    .first()
    .waitFor({ timeout: 15_000 });
}

async function hasNotes(page) {
  return noteRow(page)
    .isVisible()
    .catch(() => false);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  console.error(
    `\nIs the client running? Try \`pnpm dev\` first (expected at ${CLIENT_URL}).`,
  );
  process.exitCode = 1;
});
