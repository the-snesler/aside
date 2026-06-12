import type { ReplicatedMessageDoc } from "@aside/shared";
import { generateObject } from "ai";
import { z } from "zod";
import { messagesSync } from "../sync/messages.js";
import { writeServerBatch } from "../sync/server-write.js";
import {
  listClassifiableChannels,
  type ClassifiableChannel,
} from "./channels.js";
import { getAiConfig, saveAiStatus } from "./config.js";
import { markChannelDirty } from "./describer.js";
import { getModel } from "./provider.js";
import { getMessageState, hashText, saveMessageState } from "./state.js";

// LLM calls are rate-limited and cost money: process one note at a time.
const CONCURRENCY = 1;
// Defensive caps so a giant note or a huge channel list can't blow up a prompt.
const MAX_TEXT_CHARS = 4000;
const MAX_CHANNELS = 60;

const pending = new Set<string>();
const inFlight = new Set<string>();
let active = 0;

/** Queue a message for channel classification. Cheap and idempotent. */
export function enqueueOrganize(messageId: string): void {
  pending.add(messageId);
  drain();
}

function drain(): void {
  while (active < CONCURRENCY) {
    const messageId = nextEligible();
    if (!messageId) break;
    pending.delete(messageId);
    inFlight.add(messageId);
    active += 1;
    void processMessage(messageId)
      .catch((err) => {
        console.error(`[ai] organize ${messageId} failed:`, err);
      })
      .finally(() => {
        inFlight.delete(messageId);
        active -= 1;
        drain();
      });
  }
}

function nextEligible(): string | undefined {
  for (const id of pending) {
    if (!inFlight.has(id)) return id;
  }
  return undefined;
}

/** Classify one message and apply the result. Exported for tests; the queue is
 * the production entry point. */
export async function processMessage(messageId: string): Promise<void> {
  const config = await getAiConfig();
  if (!config.organizerEnabled) return;

  const message = await messagesSync.fetchById(messageId);
  if (!message || message._deleted) return;
  const text = message.text.trim();
  if (text.length === 0) return;

  // Loop guard: our own channel-id write fans back through onChange("messages"),
  // and the boot backfill re-enqueues everything. Skip if we've already
  // classified this exact text — re-run only when the text itself changes. (A
  // user removing an AI-added tag leaves the text unchanged, so it isn't re-added.)
  const hash = hashText(text);
  const state = await getMessageState(messageId);
  if (state && state.text_hash === hash) return;

  const channels = await listClassifiableChannels();
  if (channels.length === 0) {
    await saveMessageState(messageId, {
      textHash: hash,
      assignedChannelIds: [],
      status: "skipped",
    });
    return;
  }

  // Capture the version we classify, to guard against an edit landing mid-call.
  const sourceUpdatedAt = message.updatedAt;

  let chosen: string[];
  try {
    chosen = await classify(config, text, channels.slice(0, MAX_CHANNELS));
  } catch (err) {
    // Don't persist state on failure (e.g. missing key): once the user fixes the
    // config, the boot/reinit backfill re-enqueues and retries this message.
    const detail = err instanceof Error ? err.message : String(err);
    await saveAiStatus("error", detail);
    return;
  }

  const valid = new Set(channels.map((c) => c.id));
  const toAdd = chosen.filter(
    (id) => valid.has(id) && !message.channelIds.includes(id),
  );

  // Staleness guard: if the note was edited or deleted while we classified, its
  // updatedAt has moved — abort and let the job the edit re-queued handle it.
  const fresh = await messagesSync.fetchById(messageId);
  if (!fresh || fresh._deleted || fresh.updatedAt !== sourceUpdatedAt) return;

  if (toAdd.length > 0) {
    const updated: ReplicatedMessageDoc = {
      ...fresh,
      channelIds: [...new Set([...fresh.channelIds, ...toAdd])],
      updatedAt: Date.now(),
    };
    await writeServerBatch(messagesSync, [updated]);
    for (const id of toAdd) markChannelDirty(id);
  }

  await saveMessageState(messageId, {
    textHash: hash,
    assignedChannelIds: toAdd,
    status: "ok",
  });
  await saveAiStatus("ok", null);
}

const ORGANIZER_SYSTEM = `You are an automated note router for a personal note-taking app.
Given a note and a list of channels (each with an id, a #name, and an optional description),
decide which existing channel(s) the note belongs in.
Rules:
- Choose only from the provided channel ids.
- Only pick a channel if the note clearly fits its topic.
- Prefer a single channel; pick at most three.
- If no channel clearly fits, return an empty list. Do not force a match.`;

async function classify(
  config: Awaited<ReturnType<typeof getAiConfig>>,
  text: string,
  channels: ClassifiableChannel[],
): Promise<string[]> {
  const model = getModel(config);
  const channelList = channels
    .map(
      (c) =>
        `- id: ${c.id}\n  name: #${c.name}${c.description ? `\n  about: ${c.description}` : ""}`,
    )
    .join("\n");

  const { object } = await generateObject({
    model,
    schema: z.object({
      channelIds: z
        .array(z.string())
        .describe("ids of channels this note belongs in; [] if none fit"),
    }),
    system: ORGANIZER_SYSTEM,
    prompt: `Channels:\n${channelList}\n\nNote:\n"""\n${text.slice(0, MAX_TEXT_CHARS)}\n"""\n\nReturn the channel ids this note belongs in.`,
  });

  return object.channelIds;
}
