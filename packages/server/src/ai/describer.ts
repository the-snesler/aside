import type { ReplicatedChannelDoc } from "@aside/shared";
import { generateText } from "ai";
import { Cron } from "croner";
import { db } from "../db/index.js";
import { channelsSync } from "../sync/channels.js";
import { writeServerBatch } from "../sync/server-write.js";
import { fetchRecentChannelMessages } from "./channels.js";
import { getAiConfig, saveAiStatus } from "./config.js";
import { getModel } from "./provider.js";
import { getChannelState, hashText, saveChannelState } from "./state.js";

// Descriptions are context for the router, not user-facing freshness — so they're
// cheap to leave stale. Re-describe a channel at most this often.
const DESCRIBE_COOLDOWN_MS = 6 * 60 * 60 * 1000;
// After the organizer tags a channel, wait a beat to coalesce a burst of tags.
const SWEEP_DEBOUNCE_MS = 10_000;
const MAX_SAMPLE_MESSAGES = 40;
const MAX_DESCRIPTION_CHARS = 500;

const dirty = new Set<string>();
let sweepTimer: ReturnType<typeof setTimeout> | null = null;
let describerJob: Cron | null = null;

/**
 * Flag a channel for (re)description after its membership changed. Debounced:
 * the organizer calls this once per message it tags, so a backfill of many notes
 * collapses into one sweep.
 */
export function markChannelDirty(channelId: string): void {
  dirty.add(channelId);
  if (sweepTimer) return;
  sweepTimer = setTimeout(() => {
    sweepTimer = null;
    void sweepDirty();
  }, SWEEP_DEBOUNCE_MS);
}

async function sweepDirty(): Promise<void> {
  const ids = [...dirty];
  dirty.clear();
  for (const id of ids) {
    try {
      await describeChannel(id);
    } catch (err) {
      console.error(`[ai] describe ${id} failed:`, err);
    }
  }
}

/** Cron + boot entry point: re-describe every channel whose cooldown has lapsed. */
export async function describeAllStale(): Promise<void> {
  const config = await getAiConfig();
  if (!config.describerEnabled) return;
  const rows = await db
    .selectFrom("channels")
    .select(["id"])
    .where("deleted", "=", 0)
    .execute();
  for (const row of rows) {
    try {
      await describeChannel(row.id);
    } catch (err) {
      console.error(`[ai] describe ${row.id} failed:`, err);
    }
  }
}

/**
 * (Re)generate one channel's description from its recent notes and write it back
 * to the (synced) channels collection. Read-modify-write of the live doc so a
 * concurrent rename isn't clobbered; cooldown + content-hash guards avoid burning
 * a seq on an unchanged description.
 */
export async function describeChannel(
  channelId: string,
  force = false,
): Promise<void> {
  const config = await getAiConfig();
  if (!config.describerEnabled) return;

  const channel = await channelsSync.fetchById(channelId);
  if (!channel || channel._deleted) return;

  const state = await getChannelState(channelId);
  const now = Date.now();
  if (
    !force &&
    state?.described_at &&
    now - state.described_at < DESCRIBE_COOLDOWN_MS
  ) {
    return;
  }

  const messages = await fetchRecentChannelMessages(
    channelId,
    MAX_SAMPLE_MESSAGES,
  );
  if (messages.length === 0) return;

  const sourceHash = hashText(`${channel.name}\n${messages.join("\n---\n")}`);
  if (!force && state?.source_hash === sourceHash) {
    // Content unchanged — reset the cooldown without rewriting the description.
    await saveChannelState(channelId, {
      describedAt: now,
      sourceHash,
      status: "ok",
    });
    return;
  }

  let description: string;
  try {
    description = await describe(config, channel.name, messages);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    await saveChannelState(channelId, { status: "error", error: detail });
    await saveAiStatus("error", detail);
    return;
  }

  description = description.trim().slice(0, MAX_DESCRIPTION_CHARS);
  if (description && description !== (channel.description ?? "")) {
    const fresh = await channelsSync.fetchById(channelId);
    if (!fresh || fresh._deleted) return;
    const updated: ReplicatedChannelDoc = {
      ...fresh,
      description,
      updatedAt: Date.now(),
    };
    await writeServerBatch(channelsSync, [updated]);
  }

  await saveChannelState(channelId, {
    describedAt: Date.now(),
    sourceHash,
    status: "ok",
  });
  await saveAiStatus("ok", null);
}

const DESCRIBER_SYSTEM = `You write concise channel descriptions for a personal note-taking app.
Given a channel name and a sample of recent notes in it, write one sentence (two at most)
describing what kinds of notes belong in this channel — concrete and specific enough that an
automated router can use it to file future notes. Output only the description, no quotes or preamble.`;

async function describe(
  config: Awaited<ReturnType<typeof getAiConfig>>,
  name: string,
  messages: string[],
): Promise<string> {
  const model = getModel(config);
  const sample = messages
    .slice(0, MAX_SAMPLE_MESSAGES)
    .map((text) => `- ${text.replace(/\s+/g, " ").trim().slice(0, 200)}`)
    .join("\n");

  const { text } = await generateText({
    model,
    system: DESCRIBER_SYSTEM,
    prompt: `Channel: #${name}\n\nRecent notes:\n${sample}\n\nDescription:`,
  });
  return text;
}

/** (Re)start the cron that periodically re-describes stale channels. */
export async function startDescriberScheduler(): Promise<void> {
  stopDescriberScheduler();
  const config = await getAiConfig();
  if (!config.describerEnabled) return;
  try {
    describerJob = new Cron(
      config.describeCron,
      { name: "ai-describer", protect: true },
      () => {
        void describeAllStale();
      },
    );
  } catch (err) {
    console.error(
      `[ai] invalid describe cron "${config.describeCron}":`,
      err instanceof Error ? err.message : err,
    );
  }
}

export function stopDescriberScheduler(): void {
  describerJob?.stop();
  describerJob = null;
}
