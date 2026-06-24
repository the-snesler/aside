import webpush, {
  type PushSubscription,
  type VapidKeys,
  type WebPushError,
} from "web-push";
import { z } from "zod";
import { db } from "../db/index.js";

const CONFIG_ID = "default";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@aside.local";

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>;

interface StoredSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export async function getNotificationStatus(endpoint?: string): Promise<{
  publicKey: string;
  subscribed: boolean;
}> {
  const vapid = await getVapidKeys();
  if (!endpoint) return { publicKey: vapid.publicKey, subscribed: false };

  const found = await db
    .selectFrom("push_subscriptions")
    .select("endpoint")
    .where("endpoint", "=", endpoint)
    .executeTakeFirst();
  return { publicKey: vapid.publicKey, subscribed: !!found };
}

export async function saveSubscription(
  input: PushSubscriptionInput,
  userAgent: string | null,
): Promise<void> {
  const now = Date.now();
  await db
    .insertInto("push_subscriptions")
    .values({
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      user_agent: userAgent,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column("endpoint").doUpdateSet({
        p256dh: input.keys.p256dh,
        auth: input.keys.auth,
        user_agent: userAgent,
        updated_at: now,
      }),
    )
    .execute();
}

export async function deleteSubscription(endpoint: string): Promise<void> {
  await db
    .deleteFrom("push_subscriptions")
    .where("endpoint", "=", endpoint)
    .execute();
}

export async function sendPushToAll(payload: unknown): Promise<{
  success: number;
  failure: number;
  lastError: string | null;
}> {
  const rows = await db.selectFrom("push_subscriptions").selectAll().execute();
  if (rows.length === 0) {
    return { success: 0, failure: 0, lastError: null };
  }

  const vapid = await getVapidKeys();
  webpush.setVapidDetails(VAPID_SUBJECT, vapid.publicKey, vapid.privateKey);

  let success = 0;
  let failure = 0;
  let lastError: string | null = null;

  for (const row of rows) {
    try {
      await webpush.sendNotification(
        toWebPushSubscription({
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        }),
        JSON.stringify(payload),
      );
      success += 1;
    } catch (err) {
      failure += 1;
      lastError = err instanceof Error ? err.message : String(err);
      if (isExpiredSubscription(err)) {
        await deleteSubscription(row.endpoint);
      } else {
        console.error("[notifications] push failed:", lastError);
      }
    }
  }

  return { success, failure, lastError };
}

async function getVapidKeys(): Promise<VapidKeys> {
  const existing = await db
    .selectFrom("web_push_config")
    .selectAll()
    .where("id", "=", CONFIG_ID)
    .executeTakeFirst();
  if (existing) {
    return {
      publicKey: existing.public_key,
      privateKey: existing.private_key,
    };
  }

  const keys = webpush.generateVAPIDKeys();
  const now = Date.now();
  await db
    .insertInto("web_push_config")
    .values({
      id: CONFIG_ID,
      public_key: keys.publicKey,
      private_key: keys.privateKey,
      created_at: now,
      updated_at: now,
    })
    .execute();
  return keys;
}

function toWebPushSubscription(
  subscription: StoredSubscription,
): PushSubscription {
  return {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
  };
}

function isExpiredSubscription(err: unknown): boolean {
  const statusCode = (err as Partial<WebPushError> | undefined)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}
