import type { ReplicatedChannelDoc, ReplicatedMessageDoc } from "@aside/shared";
import { DEFAULT_CHANNEL_ID } from "@aside/shared";

/**
 * Curated content for the public demo. Every id is stable, so a reseed upserts
 * the same docs in place (a connected client converges instead of seeing
 * duplicates), and timestamps are computed at seed time so the reseeded copy
 * wins last-write-wins over any visitor edit left behind by the previous cycle.
 */
export interface DemoSeed {
  channels: ReplicatedChannelDoc[];
  messages: ReplicatedMessageDoc[];
}

export function buildDemoSeed(now: number = Date.now()): DemoSeed {
  // Notes render oldest-first, so step createdAt forward by index.
  let order = 0;
  const at = () => now + order++ * 60_000;

  const channel = (
    id: string,
    name: string,
    sortOrder: number,
    extra: Partial<ReplicatedChannelDoc> = {},
  ): ReplicatedChannelDoc => ({
    id,
    name,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    _deleted: false,
    ...extra,
  });

  const note = (
    id: string,
    channelIds: string[],
    text: string,
  ): ReplicatedMessageDoc => {
    const ts = at();
    return {
      id,
      channelIds,
      text,
      createdAt: ts,
      updatedAt: ts,
      _deleted: false,
    };
  };

  const channels: ReplicatedChannelDoc[] = [
    channel(DEFAULT_CHANNEL_ID, "general", 0),
    channel("demo-ideas", "ideas", 1, {
      description: "Half-formed thoughts worth keeping.",
    }),
    channel("demo-reading", "reading", 2, {
      description: "Links to read later — Aside renders a preview for each.",
    }),
    channel("demo-todo", "todo", 3, { type: "todo" }),
  ];

  const messages: ReplicatedMessageDoc[] = [
    note(
      "demo-welcome",
      [DEFAULT_CHANNEL_ID],
      [
        "## Welcome to the Aside demo 👋",
        "",
        "This is a **public sandbox** that resets periodically, so feel free to poke around.",
        "",
        "- Jot a quick note and hit send",
        "- Tag it with a `#channel` to file it, or drag it onto one in the sidebar",
        "- Paste a link to see a preview card",
        "",
        "_Uploads, feeds, and AI settings are turned off in the demo._",
      ].join("\n"),
    ),
    note(
      "demo-markdown",
      [DEFAULT_CHANNEL_ID],
      [
        "Notes render Markdown, including `inline code`, lists, and quotes:",
        "",
        "> A note you don't have to file is a note you'll actually write.",
        "",
        "```ts",
        'const aside = "local-first notes";',
        "```",
      ].join("\n"),
    ),
    note(
      "demo-idea-1",
      ["demo-ideas"],
      "A reading-list channel that auto-archives links once I've opened them. #ideas",
    ),
    note(
      "demo-idea-2",
      ["demo-ideas"],
      "Keyboard-only capture: a global hotkey that drops whatever's on the clipboard into #general.",
    ),
    note(
      "demo-reading-1",
      ["demo-reading"],
      "The project that powers this demo: https://github.com/the-snesler/aside",
    ),
    note(
      "demo-reading-2",
      ["demo-reading"],
      "Some background reading on the habit itself: https://en.wikipedia.org/wiki/Note-taking",
    ),
    note(
      "demo-todo-1",
      ["demo-todo"],
      "Try sending a note from your phone and watching it sync here.",
    ),
    note(
      "demo-todo-2",
      ["demo-todo"],
      "Star the repo if you'd self-host this. ⭐",
    ),
  ];

  return { channels, messages };
}
