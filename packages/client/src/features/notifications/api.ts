import { authFetch } from "../../auth";

export interface NotificationStatus {
  publicKey: string;
  subscribed: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(url, init);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `${res.status} ${res.statusText}${detail ? `: ${detail}` : ""}`,
    );
  }
  return res.json() as Promise<T>;
}

function jsonInit(method: string, body: unknown): RequestInit {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

export function getNotificationStatus(
  endpoint?: string,
): Promise<NotificationStatus> {
  const qs = endpoint ? `?endpoint=${encodeURIComponent(endpoint)}` : "";
  return request(`/api/notifications/status${qs}`);
}

export async function enablePushNotifications(): Promise<NotificationStatus> {
  if (!("Notification" in window))
    throw new Error("Notifications unsupported.");
  if (!("serviceWorker" in navigator)) {
    throw new Error("Service workers unsupported.");
  }
  if (!("PushManager" in window)) throw new Error("Push unsupported.");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(`Notification permission is ${permission}.`);
  }

  const { publicKey } = await getNotificationStatus();
  const registration = await navigator.serviceWorker.register("/sw.js");
  const ready = await navigator.serviceWorker.ready;
  const activeRegistration = ready || registration;
  const existing = await activeRegistration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await activeRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToArrayBuffer(publicKey),
    }));

  await request(
    "/api/notifications/subscribe",
    jsonInit("POST", subscription.toJSON()),
  );
  return getNotificationStatus(subscription.endpoint);
}

export async function disablePushNotifications(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  await request(
    "/api/notifications/unsubscribe",
    jsonInit("POST", { endpoint: subscription.endpoint }),
  );
  await subscription.unsubscribe();
}

export async function currentPushEndpoint(): Promise<string | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return subscription?.endpoint;
}

function urlBase64ToArrayBuffer(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output.buffer as ArrayBuffer;
}
