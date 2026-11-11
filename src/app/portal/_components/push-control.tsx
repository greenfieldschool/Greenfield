"use client";

import { useEffect, useState } from "react";
import { BellOff, BellRing, Loader2, Send, Share, SquarePlus, Smartphone } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { useOptionalToast } from "@/components/toast-provider";
import { currentSubscription, pushSupport, sendTestPush, turnOffPush, turnOnPush, type PushSupport } from "@/lib/push-client";

type State = "loading" | "off" | "on" | "blocked" | Exclude<PushSupport, "ok">;

/**
 * "Phone notifications" on the Notifications page: turn alerts on or off for this phone, send a test, and the steps
 * when the phone can't yet (iPhone not on the Home Screen, notifications blocked, an old iPhone or browser).
 */
export function PushControl({ publicKey, role }: { publicKey: string; role: "parent" | "student" }) {
  const toast = useOptionalToast();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState<"on" | "off" | "test" | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const support = pushSupport();
      if (support !== "ok") return alive && setState(support);
      if (Notification.permission === "denied") return alive && setState("blocked");
      const sub = Notification.permission === "granted" ? await currentSubscription() : null;
      if (alive) setState(sub ? "on" : "off");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const on = async () => {
    setBusy("on");
    const { result, message } = await turnOnPush(publicKey);
    setBusy(null);
    if (result === "on") {
      setState("on");
      toast?.showToast("Phone notifications are on");
    } else if (result === "denied") {
      setState("blocked");
    } else if (result === "error") {
      toast?.showToast(message ?? "Couldn't turn them on. Please try again.", "error");
    }
  };

  const off = async () => {
    setBusy("off");
    const ok = await turnOffPush();
    setBusy(null);
    setState("off");
    toast?.showToast(ok ? "Phone notifications are off" : "Turned off on this phone", ok ? "success" : "info");
  };

  const test = async () => {
    setBusy("test");
    const r = await sendTestPush();
    setBusy(null);
    if (r.gone) setState("off");
    toast?.showToast(r.ok ? "Test sent. It should arrive in a few seconds." : (r.message ?? "Couldn't send the test."), r.ok ? "success" : "error");
  };

  const what = role === "student" ? "new work, marks, lesson notes and online classes" : "new work, marks, lesson notes, online classes and school announcements";

  return (
    <Card id="phone">
      <CardHeader
        title="Phone notifications"
        description={`Get an alert on this phone's lock screen for ${what}, even when the portal is closed.`}
      />
      <div className="px-5 pb-5 pt-4 sm:px-6" aria-live="polite">
        {state === "loading" ? (
          <div className="flex min-h-[40px] items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Checking this phone…
          </div>
        ) : null}

        {state === "off" ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">Off on this phone. Your phone will ask you to allow notifications: tap <strong>Allow</strong>.</p>
            <button type="button" onClick={on} disabled={busy !== null} className={buttonClasses({ variant: "primary", size: "md", className: "w-full sm:w-auto" })}>
              {busy === "on" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellRing className="h-4 w-4" aria-hidden="true" />}
              {busy === "on" ? "Turning on…" : "Turn on phone notifications"}
            </button>
          </div>
        ) : null}

        {state === "on" ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-sm font-medium text-brand-green-800">
              <span className="block h-2.5 w-2.5 rounded-full bg-brand-green" aria-hidden="true" />
              On for this phone
            </p>
            <p className="text-sm text-slate-600">Using another phone or tablet too? Open the portal there and turn it on there as well.</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={test} disabled={busy !== null} className={buttonClasses({ variant: "secondary", size: "md" })}>
                {busy === "test" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Send className="h-4 w-4" aria-hidden="true" />}
                Send a test
              </button>
              <button type="button" onClick={off} disabled={busy !== null} className={buttonClasses({ variant: "ghost", size: "md" })}>
                {busy === "off" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BellOff className="h-4 w-4" aria-hidden="true" />}
                Turn off
              </button>
            </div>
          </div>
        ) : null}

        {state === "blocked" ? (
          <div className="space-y-2 text-sm text-slate-700">
            <p className="font-medium text-slate-900">Notifications are blocked for Greenfield on this phone.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Android:</strong> press and hold the Greenfield icon, tap <strong>App info</strong> (ⓘ), then{" "}
                <strong>Notifications</strong> and switch them on. In the browser: tap the icon left of the web address, then{" "}
                <strong>Permissions</strong> or <strong>Site settings</strong> → <strong>Notifications</strong> → <strong>Allow</strong>.
              </li>
              <li>
                <strong>iPhone:</strong> open <strong>Settings</strong> → <strong>Notifications</strong> → <strong>Greenfield</strong> and switch on{" "}
                <strong>Allow Notifications</strong>.
              </li>
            </ul>
            <p>Then come back to this page.</p>
          </div>
        ) : null}

        {state === "ios-browser" ? (
          <div className="space-y-3 text-sm text-slate-700">
            <p>On iPhone and iPad, alerts only work from the Greenfield app on your Home Screen. It takes three taps:</p>
            <ol className="space-y-2">
              <li className="flex items-start gap-3">
                <Step n={1} />
                <span>
                  Tap <Share className="inline h-4 w-4 -translate-y-0.5 text-brand-green-700" aria-label="Share" /> <strong>Share</strong> at the bottom of
                  Safari.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Step n={2} />
                <span>
                  Choose <SquarePlus className="inline h-4 w-4 -translate-y-0.5 text-brand-green-700" aria-hidden="true" /> <strong>Add to Home Screen</strong>, then{" "}
                  <strong>Add</strong>.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <Step n={3} />
                <span>
                  Open <strong>Greenfield</strong> from your Home Screen, sign in, come back to <strong>Notifications</strong> and tap{" "}
                  <strong>Turn on phone notifications</strong>.
                </span>
              </li>
            </ol>
            <p className="text-xs text-slate-500">Needs iOS 16.4 or later (Settings → General → Software Update).</p>
          </div>
        ) : null}

        {state === "ios-other-browser" ? (
          <p className="text-sm text-slate-700">
            On iPhone and iPad, open the portal in <strong>Safari</strong>, add it to your Home Screen (Share → <strong>Add to Home Screen</strong>), then
            open Greenfield from the Home Screen and turn alerts on there.
          </p>
        ) : null}

        {state === "ios-old" ? (
          <p className="flex items-start gap-2 text-sm text-slate-700">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            This iPhone needs updating first: alerts need iOS 16.4 or later (Settings → General → Software Update). The bell and emails still tell you
            everything.
          </p>
        ) : null}

        {state === "unsupported" ? (
          <p className="text-sm text-slate-700">
            This browser can&apos;t show alerts. Open the portal in <strong>Chrome</strong> (Android) or add it to your Home Screen, then try again. The bell
            and emails still tell you everything.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

function Step({ n }: { n: number }) {
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-green-50 text-xs font-semibold text-brand-green-800">
      {n}
    </span>
  );
}
