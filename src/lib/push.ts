import webpush, { WebPushError, type PushSubscription } from "web-push";

// Phone notifications (Web Push). Server only: signs each alert with the school's VAPID keys and hands it to the
// phone maker's push service (Google for Android/Chrome, Apple for iPhone, Mozilla for Firefox).
// Keys (Vercel env): VAPID_PUBLIC_KEY or NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
// (mailto: or https: address the push services can contact). Make them with: npx web-push generate-vapid-keys

export type PushPayload = {
  title: string;
  body?: string;
  /** Portal page opened when the alert is tapped. */
  url: string;
  /** Alerts with the same tag replace each other on the phone (e.g. one per assignment for a parent of twins). */
  tag?: string;
  /** Unread count for the app icon's badge, where the phone supports it. */
  unread?: number;
};

export type PushResult = "sent" | "gone" | "retry" | "failed";

export type StoredSubscription = { id: string; endpoint: string; p256dh: string; auth: string };

export function vapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null;
}

let configured: boolean | null = null;

/** True when the three VAPID settings are present (sets web-push up once). */
export function pushConfigured(): boolean {
  if (configured !== null) return configured;
  const publicKey = vapidPublicKey();
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "https://greenfieldschool.ng";
  if (!publicKey || !privateKey) return (configured = false);
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
  } catch (e) {
    console.error("Phone notifications: VAPID keys are not valid", e);
    configured = false;
  }
  return configured;
}

/** Keeps the alert small (push services allow ~4 KB) and inside the portal. */
export function buildPayload(p: PushPayload): string {
  const url = p.url.startsWith("/portal") && !p.url.startsWith("//") ? p.url : "/portal/notifications";
  return JSON.stringify({
    title: p.title.slice(0, 120),
    body: p.body ? p.body.slice(0, 300) : undefined,
    url,
    tag: p.tag,
    unread: p.unread
  });
}

/**
 * Sends one alert to one phone. "gone": the phone turned alerts off or the address expired (delete it);
 * "retry": the push service is busy or down; "failed": anything else (don't retry).
 */
export async function sendPush(sub: StoredSubscription, payload: string, opts: { urgent?: boolean } = {}): Promise<PushResult> {
  if (!pushConfigured()) return "failed";
  const subscription: PushSubscription = { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } };
  try {
    await webpush.sendNotification(subscription, payload, {
      TTL: 24 * 3600,
      urgency: opts.urgent ? "high" : "normal",
      timeout: 10000
    });
    return "sent";
  } catch (e) {
    const status = e instanceof WebPushError ? e.statusCode : 0;
    if (status === 404 || status === 410) return "gone";
    if (status === 429 || status >= 500 || status === 0) return "retry";
    // 400/403/413: a bad or mismatched subscription (e.g. made with old keys): treat as gone if it's the keys.
    if (status === 403 || status === 400) return "gone";
    console.error("Phone notification not sent", status, e instanceof Error ? e.message : e);
    return "failed";
  }
}

/** Runs tasks a few at a time so a big class doesn't open hundreds of connections at once. */
export async function inBatches<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}
