import { db } from "../db/index.js";
import { sendPushToAll } from "../notifications/push.js";

const SWEEP_INTERVAL_MS = 60 * 1000;

let interval: ReturnType<typeof setInterval> | null = null;
let running = false;

export async function tick(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await runDueReminderSweep();
  } catch (err) {
    console.error("[reminders] sweep failed:", err);
  } finally {
    running = false;
  }
}

export function startReminderWorker(): void {
  if (interval) return;
  void tick();
  interval = setInterval(() => {
    void tick();
  }, SWEEP_INTERVAL_MS);
}

export function stopReminderWorker(): void {
  if (!interval) return;
  clearInterval(interval);
  interval = null;
}

export async function runDueReminderSweep(now = Date.now()): Promise<{
  checked: number;
  delivered: number;
}> {
  const rows = await db
    .selectFrom("messages")
    .select(["id", "text", "due_at"])
    .where("deleted", "=", 0)
    .where("due_at", "is not", null)
    .where("due_at", "<=", now)
    .execute();

  let delivered = 0;
  for (const row of rows) {
    if (row.due_at === null) continue;
    const deliveryId = deliveryKey(row.id, row.due_at);
    const alreadyDelivered = await db
      .selectFrom("reminder_deliveries")
      .select("id")
      .where("id", "=", deliveryId)
      .executeTakeFirst();
    if (alreadyDelivered) continue;

    const result = await sendPushToAll({
      type: "reminder",
      title: "Reminder",
      body: notificationBody(row.text),
      messageId: row.id,
      dueAt: row.due_at,
      url: "/",
    });

    if (result.success === 0) continue;

    await db
      .insertInto("reminder_deliveries")
      .values({
        id: deliveryId,
        message_id: row.id,
        due_at: row.due_at,
        delivered_at: now,
        last_error: result.lastError,
      })
      .execute();
    delivered += 1;
  }

  return { checked: rows.length, delivered };
}

function deliveryKey(messageId: string, dueAt: number): string {
  return `${messageId}:${dueAt}`;
}

function notificationBody(text: string): string {
  const trimmed = text.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 160) return trimmed;
  return `${trimmed.slice(0, 157)}...`;
}
