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
// How long to keep waiting for a note row after the empty state shows. A fresh
// profile flashes "no notes" for a beat before its first replication pull lands,
// then the app swaps in the synced notes on its own (MessageList's recovery
// effect). This grace gives that self-heal time to happen; a genuinely empty
// workspace just rides it out and screenshots empty.
const SELF_HEAL_GRACE_MS = 4000;

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

    // A brand-new browser profile's first mount races RxDB's initial replication
    // pull, so the list can flash "no notes" before history syncs in. The app
    // now repopulates itself once that data arrives (MessageList's recovery
    // effect), so the normal path never needs a reload — `waitForListToSettle`
    // simply waits the synced notes in. Reload only as a last resort, if the
    // list never rendered at all (a genuine hang).
    if (!(await waitForListToSettle(page))) {
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

/**
 * Waits for the message list to reach a stable state and reports whether it got
 * there. A note row or the empty state both mean the list mounted and finished
 * its first load. Because a cold profile can show the empty state for a beat
 * before notes sync in, we wait out a short grace for the app to repopulate
 * before accepting "empty". Returns false only if the list never rendered at all
 * (a genuine hang), so the caller can decide whether a reload is warranted.
 */
async function waitForListToSettle(page) {
  try {
    await noteRow(page)
      .or(page.getByText(EMPTY_STATE_TEXT))
      .first()
      .waitFor({ timeout: 15_000 });
  } catch {
    return false;
  }
  if (await hasNotes(page)) return true;
  // Empty state is up; give the app's self-heal a beat to swap in synced notes.
  await noteRow(page)
    .waitFor({ timeout: SELF_HEAL_GRACE_MS })
    .catch(() => {});
  return true;
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
