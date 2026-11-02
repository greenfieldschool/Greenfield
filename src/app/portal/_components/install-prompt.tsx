"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { LogoMark } from "@/components/ui/logo";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const KEY = "gf-install-dismissed";
const QUIET_DAYS = 30;

/**
 * Phones only: invites the parent or pupil to add the portal to their home screen, so it opens like an app.
 * - Android (Chrome, Edge, Samsung): an "Add to home screen" button that opens the phone's own install box.
 * - iPhone and iPad (Safari): the two taps to do it, since Safari has no button for websites to use.
 * Not shown once installed, when opened from the home screen already, or for 30 days after "Not now".
 */
export function InstallPrompt() {
  const [mode, setMode] = useState<"android" | "ios" | null>(null);
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const phone = window.matchMedia("(max-width: 1023px)").matches;
    let quiet = false;
    try {
      const at = Number(localStorage.getItem(KEY) ?? 0);
      quiet = Date.now() - at < QUIET_DAYS * 864e5;
    } catch {
      // Private browsing: just show it.
    }
    if (standalone || !phone || quiet) return;

    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    // Only Safari can add to the home screen on an iPhone; other iPhone browsers and in-app browsers can't.
    const safari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|WhatsApp/.test(ua);
    if (safari) setMode("ios");

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
      setMode("android");
    };
    const onInstalled = () => setMode(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      // Nothing to remember it in; it simply comes back next visit.
    }
    setMode(null);
  };

  if (!mode) return null;

  return (
    <div className="gf-rise relative overflow-hidden rounded-2xl border border-brand-green-200 bg-gradient-to-br from-brand-green-50 to-white p-4 shadow-card lg:hidden">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="absolute right-2 top-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 active:bg-slate-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="flex items-start gap-3 pr-8">
        <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-green-950">
          <LogoMark className="h-8 w-7" />
        </span>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900">Add Greenfield to your home screen</div>
          {mode === "android" ? (
            <p className="mt-0.5 text-sm text-slate-600">Open report cards, fees and messages in one tap, like an app.</p>
          ) : (
            <p className="mt-0.5 text-sm text-slate-600">
              Tap <Share className="inline h-4 w-4 -translate-y-0.5 text-brand-green-700" aria-label="Share" /> at the
              bottom of Safari, then <span className="font-semibold">Add to Home Screen</span>.
            </p>
          )}
        </div>
      </div>
      {mode === "android" ? (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className={buttonClasses({ variant: "primary", size: "md", className: "flex-1" })}
            onClick={async () => {
              if (!event) return;
              await event.prompt();
              const choice = await event.userChoice;
              if (choice.outcome === "accepted") setMode(null);
              setEvent(null);
            }}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Add to home screen
          </button>
          <button type="button" onClick={dismiss} className={buttonClasses({ variant: "ghost", size: "md" })}>
            Not now
          </button>
        </div>
      ) : null}
    </div>
  );
}
