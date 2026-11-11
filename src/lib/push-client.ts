// Browser side of phone notifications: what this phone can do, and turning alerts on or off. Used by the portal's
// PushSetup (registers the service worker, gentle prompt) and PushControl (Notifications page).

export type PushSupport =
  | "ok" //               can turn on
  | "ios-browser" //      iPhone/iPad in Safari: must add to Home Screen first (iOS 16.4+)
  | "ios-other-browser" // iPhone/iPad in Chrome, WhatsApp's browser etc.: open in Safari, then add to Home Screen
  | "ios-old" //          on the Home Screen but iOS older than 16.4
  | "unsupported"; //     this browser can't do it

export const SW_URL = "/sw.js";
export const SW_SCOPE = "/portal";

export function isIos() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function isStandalone() {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function pushSupport(): PushSupport {
  const capable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (isIos()) {
    if (isStandalone()) return capable ? "ok" : "ios-old";
    const ua = navigator.userAgent;
    const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|WhatsApp/.test(ua);
    return safari ? "ios-browser" : "ios-other-browser";
  }
  return capable ? "ok" : "unsupported";
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE });
  } catch {
    return null;
  }
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  try {
    const reg = (await navigator.serviceWorker.getRegistration(SW_SCOPE)) ?? (await registerServiceWorker());
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch {
    return null;
  }
}

function keyBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function save(sub: PushSubscription) {
  const json = sub.toJSON();
  const res = await fetch("/api/push/subscription", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys })
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Couldn't save. Please try again later.");
}

export type TurnOnResult = "on" | "denied" | "dismissed" | "error";

/** Must run from a tap (the phone asks for permission). Saves this phone for the signed-in person. */
export async function turnOnPush(publicKey: string): Promise<{ result: TurnOnResult; message?: string }> {
  try {
    const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (permission === "denied") return { result: "denied" };
    if (permission !== "granted") return { result: "dismissed" };
    const reg = (await registerServiceWorker()) ?? (await navigator.serviceWorker.ready);
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    // A subscription made with other keys can't receive our alerts: replace it.
    const existingKey = sub?.options?.applicationServerKey;
    if (sub && existingKey) {
      const a = new Uint8Array(existingKey);
      const b = keyBytes(publicKey);
      if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    sub = sub ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
    try {
      await save(sub);
    } catch (e) {
      await sub.unsubscribe().catch(() => undefined);
      throw e;
    }
    return { result: "on" };
  } catch (e) {
    return { result: "error", message: e instanceof Error ? e.message : undefined };
  }
}

/** Stops alerts on this phone (and removes it from the person's list). */
export async function turnOffPush(): Promise<boolean> {
  const sub = await currentSubscription();
  if (!sub) return true;
  const endpoint = sub.endpoint;
  await sub.unsubscribe().catch(() => undefined);
  const res = await fetch("/api/push/subscription", {
    method: "DELETE",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint })
  }).catch(() => null);
  return Boolean(res?.ok);
}

/** Makes sure this phone's alerts go to whoever is signed in now (a shared phone, or after signing in again). */
export async function resyncPush(): Promise<void> {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const sub = await currentSubscription();
  if (sub) await save(sub).catch(() => undefined);
}

/** gone: the push service no longer knows this phone (it's been removed; the person needs to turn on again). */
export async function sendTestPush(): Promise<{ ok: boolean; gone?: boolean; message?: string }> {
  const sub = await currentSubscription();
  if (!sub) return { ok: false, message: "This phone isn't turned on yet." };
  const res = await fetch("/api/push/test", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint })
  }).catch(() => null);
  if (res?.ok) return { ok: true };
  const body = (await res?.json().catch(() => null)) as { error?: string } | null;
  if (res?.status === 410) await sub.unsubscribe().catch(() => undefined);
  return { ok: false, gone: res?.status === 410, message: body?.error ?? "Couldn't send the test. Please check your internet and try again." };
}

/** The number on the app icon (where the phone supports it), kept in step with the bell. */
export function setAppBadge(count: number) {
  const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
  try {
    if (count > 0) void nav.setAppBadge?.(count)?.catch(() => undefined);
    else void nav.clearAppBadge?.()?.catch(() => undefined);
  } catch {
    // Not supported: nothing to do.
  }
}
