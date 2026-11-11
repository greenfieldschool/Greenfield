"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BellRing, Loader2, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { useOptionalToast } from "@/components/toast-provider";
import { currentSubscription, isStandalone, pushSupport, registerServiceWorker, resyncPush, setAppBadge, turnOnPush } from "@/lib/push-client";

// Mounted once by the portal layout (parents and pupils only).
// - Registers the service worker that shows phone notifications (public/sw.js, scope /portal).
// - Once per visit, makes sure this phone's alerts go to whoever is signed in now (shared phones).
// - Keeps the number on the app icon in step with the bell.
// - A gentle, one-time invitation to turn alerts on: only in the app opened from the home screen, never on the first
//   visit, never on the Notifications page (the switch is there), and after "Not now" not again for 14 days (and
//   never after the second "Not now").

const VISITS = "gf-push-visits";
const VISIT_COUNTED = "gf-push-visit-counted";
const DISMISSED_AT = "gf-push-dismissed-at";
const DISMISSED_COUNT = "gf-push-dismissed-count";
const SYNCED = "gf-push-synced";

function read(store: Storage, key: string) {
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}
function write(store: Storage, key: string, value: string) {
  try {
    store.setItem(key, value);
  } catch {
    // Private browsing: forget it.
  }
}

export function PushSetup({ publicKey, unread, userKey }: { publicKey: string | null; unread: number; userKey: string }) {
  const pathname = usePathname();
  const toast = useOptionalToast();
  const [invite, setInvite] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAppBadge(unread);
  }, [unread]);

  useEffect(() => {
    if (!publicKey || pushSupport() !== "ok") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;

    // Count visits (one per browser session) so the invitation never shows on the first one.
    if (!read(sessionStorage, VISIT_COUNTED)) {
      write(sessionStorage, VISIT_COUNTED, "1");
      write(localStorage, VISITS, String(Number(read(localStorage, VISITS) ?? 0) + 1));
    }

    const start = async () => {
      await registerServiceWorker();
      if (read(sessionStorage, SYNCED) !== userKey) {
        write(sessionStorage, SYNCED, userKey);
        await resyncPush();
      }
      const visits = Number(read(localStorage, VISITS) ?? 0);
      const dismissedAt = Number(read(localStorage, DISMISSED_AT) ?? 0);
      const dismissedCount = Number(read(localStorage, DISMISSED_COUNT) ?? 0);
      const quiet = dismissedCount >= 2 || Date.now() - dismissedAt < 14 * 864e5;
      if (!isStandalone() || visits < 2 || quiet || Notification.permission !== "default") return;
      if (await currentSubscription()) return;
      timer = setTimeout(() => alive && setInvite(true), 6000);
    };
    // After the page has settled, so it never slows the first paint on a slow phone.
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback;
    if (idle) idle(() => void start());
    else timer = setTimeout(() => void start(), 1500);

    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [publicKey, userKey]);

  if (!invite || !publicKey || pathname?.startsWith("/portal/notifications")) return null;

  const notNow = () => {
    write(localStorage, DISMISSED_AT, String(Date.now()));
    write(localStorage, DISMISSED_COUNT, String(Number(read(localStorage, DISMISSED_COUNT) ?? 0) + 1));
    setInvite(false);
  };

  const turnOn = async () => {
    setBusy(true);
    const { result, message } = await turnOnPush(publicKey);
    setBusy(false);
    if (result === "on") toast?.showToast("Phone notifications are on");
    else if (result === "error") toast?.showToast(message ?? "Couldn't turn them on. You can try again on the Notifications page.", "error");
    if (result === "dismissed") notNow();
    else setInvite(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="gf-push-invite-title"
      className="gf-rise fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-brand-green-200 bg-white p-4 shadow-2xl lg:inset-x-auto lg:bottom-6 lg:right-6 lg:w-96 print:hidden"
    >
      <button
        type="button"
        onClick={notNow}
        aria-label="Not now"
        className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-green-50 text-brand-green-700">
          <BellRing className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div id="gf-push-invite-title" className="font-semibold text-slate-900">
            Get alerts on this phone?
          </div>
          <p className="mt-0.5 text-sm text-slate-600">Know straight away about new work, marks and changes to online classes, even when the app is closed.</p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={turnOn} disabled={busy} className={buttonClasses({ variant: "primary", size: "md", className: "flex-1" })}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
          {busy ? "Turning on…" : "Turn on"}
        </button>
        <button type="button" onClick={notNow} className={buttonClasses({ variant: "ghost", size: "md" })}>
          Not now
        </button>
      </div>
    </div>
  );
}
