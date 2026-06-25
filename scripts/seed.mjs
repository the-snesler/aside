#!/usr/bin/env node
/**
 * Bootstraps a freshly-cloned Aside instance for local dev: claims the owner
 * password (so the app isn't stuck behind the setup wall) and drops in a
 * handful of example notes, so a new worktree isn't a blank slate.
 *
 * Safe to re-run: the password step logs in instead of erroring once setup is
 * done, and re-seeding the same note/channel ids is a no-op (the sync push
 * endpoint treats an existing id as a conflict and skips it rather than
 * overwriting).
 *
 * Usage:   node scripts/seed.mjs
 * Env:     ASIDE_SERVER_URL  default http://localhost:3001
 *          ASIDE_PASSWORD    default "admin" (matches the CLAUDE.md dev convention)
 */

const SERVER_URL = process.env.ASIDE_SERVER_URL ?? "http://localhost:3001";
const PASSWORD = process.env.ASIDE_PASSWORD ?? "admin";

async function main() {
  const token = await claimToken();

  const now = Date.now();
  let order = 0;
  // Notes render oldest-first; step createdAt forward so they land in a sane order.
  const at = () => now + order++ * 60_000;

  const channel = (id, name, sortOrder, extra = {}) => ({
    id,
    name,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    _deleted: false,
    ...extra,
  });
  const note = (id, channelIds, text) => {
    const ts = at();
    return {
      id,
      channelIds,
      text,
      createdAt: ts,
      dueAt: 0,
      updatedAt: ts,
      _deleted: false,
    };
  };

  const channels = [
    channel("general", "general", 0),
    channel("seed-ideas", "ideas", 1, {
      description: "Half-formed thoughts worth keeping.",
    }),
    channel("seed-reading", "reading", 2, {
      description: "Links to read later.",
    }),
  ];

  const messages = [
    note(
      "seed-welcome",
      ["general"],
      [
        "## Welcome to your Aside workspace",
        "",
        "This note was dropped in by `scripts/seed.mjs` so there's something to look",
        "at on a fresh worktree. Edit or delete it freely.",
      ].join("\n"),
    ),
    note(
      "seed-markdown",
      ["general"],
      [
        "Notes render Markdown — lists, `inline code`, and quotes:",
        "",
        "> A note you don't have to file is a note you'll actually write.",
      ].join("\n"),
    ),
    note(
      "seed-idea-1",
      ["seed-ideas"],
      "A reading-list channel that auto-archives links once I've opened them. #ideas",
    ),
    note(
      "seed-reading-1",
      ["seed-reading"],
      "The project this app is built on: https://github.com/the-snesler/aside",
    ),
  ];

  const channelResult = await push("channels", channels, token);
  const messageResult = await push("messages", messages, token);

  console.log(
    `Channels: ${channelResult.written} written, ${channelResult.skipped} already present.`,
  );
  console.log(
    `Notes: ${messageResult.written} written, ${messageResult.skipped} already present.`,
  );
  console.log(`Log in with password: ${PASSWORD}`);
}

/** Claims the owner password on first run, or logs in on subsequent runs. */
async function claimToken() {
  const status = await getJson("/api/auth/status");
  const path = status.setupRequired ? "/api/auth/setup" : "/api/auth/login";
  const res = await fetch(`${SERVER_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PASSWORD }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const hint = status.setupRequired
      ? `Setup failed (${res.status}): ${detail}`
      : `Login failed (${res.status}) — the owner password isn't "${PASSWORD}". ` +
        `Set ASIDE_PASSWORD to match it, or wipe the data dir to start over. ${detail}`;
    throw new Error(hint);
  }
  return (await res.json()).token;
}

/** Pushes docs through the same sync/push endpoint the client uses. */
async function push(collection, docs, token) {
  const rows = docs.map((doc) => ({
    newDocumentState: doc,
    assumedMasterState: null,
  }));
  const res = await fetch(`${SERVER_URL}/api/sync/${collection}/push`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    throw new Error(
      `Push to ${collection} failed (${res.status}): ${await res.text()}`,
    );
  }
  // The endpoint returns the docs it *didn't* write (already-present conflicts).
  const conflicts = await res.json();
  return { written: docs.length - conflicts.length, skipped: conflicts.length };
}

async function getJson(path) {
  const res = await fetch(`${SERVER_URL}${path}`);
  if (!res.ok) throw new Error(`${path} failed (${res.status})`);
  return res.json();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  console.error(
    `\nIs the server running? Try \`pnpm dev\` first (expected at ${SERVER_URL}).`,
  );
  process.exitCode = 1;
});
