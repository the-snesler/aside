import type { Context } from "hono";

/**
 * Demo mode turns a normal single-user Aside instance into a public, writable
 * sandbox: visitors skip the password wall and can create notes/channels, but
 * the risky surfaces (uploads, feeds, AI config) are locked down and the whole
 * workspace wipes + reseeds on a schedule. Everything here is a no-op unless
 * `DEMO_MODE=1`, so a self-hosted install is byte-for-byte unchanged.
 */
export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "1";
}

/**
 * The sync collections a visitor may write in demo mode. Notes, channels, and
 * synced UI prefs (config) are the core "try it" surface; everything else is
 * either server-owned (embeds) or disabled (attachments, since uploads are off).
 */
export const DEMO_WRITABLE_COLLECTIONS = new Set([
  "messages",
  "channels",
  "config",
]);

/** Cron driving the periodic wipe + reseed. Hourly by default. */
export function demoResetCron(): string {
  return process.env.DEMO_RESET_CRON ?? "0 * * * *";
}

/**
 * Standard response for an action disabled in the public demo. Deliberately a
 * `403` (not `401`): the client treats 401 as "session lost" and bounces to the
 * login screen, which would trap a passwordless demo visitor. 403 means
 * "authenticated but not allowed here", which the client surfaces inline.
 */
export function demoForbidden(c: Context): Response {
  return c.json({ error: "This action is disabled in the public demo." }, 403);
}

/**
 * A simple rolling-window counter. Used to cap how many *real* OpenGraph fetches
 * the demo server will make per window, so a flood of unique URLs in a shared
 * public sandbox can't turn it into an open fetch/scanning proxy or run up
 * egress. Cache hits don't consume budget (the check sits at the fetch boundary).
 */
export class RollingBudget {
  private readonly hits: number[] = [];

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Records and allows one unit if under budget for the current window. */
  tryConsume(now: number = Date.now()): boolean {
    const cutoff = now - this.windowMs;
    while (this.hits.length > 0 && this.hits[0]! <= cutoff) this.hits.shift();
    if (this.hits.length >= this.max) return false;
    this.hits.push(now);
    return true;
  }
}

/** Max real OpenGraph fetches per rolling hour while in demo mode. */
export const demoEmbedBudget = new RollingBudget(200, 60 * 60 * 1000);
