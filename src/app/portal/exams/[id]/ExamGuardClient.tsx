"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

// Keeps the exam fair without punishing a dimmed screen: tells the school when the page is hidden or loses focus
// and when it comes back (the database locks the exam only after 10 seconds away), checks in every 15 seconds so a
// power cut or lost connection is noticed, and shows the time left. The clock is paused while the pupil is away.

function clock(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

export default function ExamGuardClient({ attemptId, initialSecondsLeft }: { attemptId: string; initialSecondsLeft: number | null }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(initialSecondsLeft);
  const [warning, setWarning] = useState<string | null>(null);
  const away = useRef(false);
  const hiddenAt = useRef(0);
  const finishing = useRef(false);

  const send = useCallback(
    async (event: "heartbeat" | "away" | "back", hiddenSeconds?: number) => {
      try {
        const res = await fetch("/portal/exams/checkin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId, event, hiddenSeconds }),
          keepalive: true
        });
        const data = (await res.json().catch(() => null)) as { ok: boolean; secondsLeft: number | null; locked: boolean; submitted: boolean } | null;
        if (!data?.ok) return;
        if (data.locked || data.submitted) {
          router.refresh();
          return;
        }
        if (event !== "away") setLeft(data.secondsLeft);
      } catch {
        // Offline: the next check-in tells the school how long the page was cut off.
      }
    },
    [attemptId, router]
  );

  useEffect(() => {
    const goAway = () => {
      if (away.current) return;
      away.current = true;
      hiddenAt.current = Date.now();
      void send("away");
    };
    const comeBack = () => {
      if (!away.current || document.visibilityState !== "visible") return;
      away.current = false;
      const seconds = Math.round((Date.now() - hiddenAt.current) / 1000);
      if (seconds < 10) setWarning("You left the exam page. Leaving for 10 seconds or more locks your exam.");
      void send("back", seconds);
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? goAway() : comeBack());
    window.addEventListener("blur", goAway);
    window.addEventListener("focus", comeBack);
    document.addEventListener("visibilitychange", onVisibility);
    const beat = window.setInterval(() => {
      if (!away.current && document.visibilityState === "visible") void send("heartbeat");
    }, 15000);
    return () => {
      window.removeEventListener("blur", goAway);
      window.removeEventListener("focus", comeBack);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(beat);
    };
  }, [send]);

  // Count down once a second while the pupil is on the page; at zero, check in so the school hands the answers in.
  useEffect(() => {
    if (left === null) return;
    const t = window.setInterval(() => {
      if (away.current) return;
      setLeft((v) => (v === null ? v : v - 1));
    }, 1000);
    return () => window.clearInterval(t);
  }, [left === null]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (left !== null && left <= 0 && !finishing.current) {
      finishing.current = true;
      void send("heartbeat").finally(() => router.refresh());
    }
  }, [left, send, router]);

  useEffect(() => {
    if (!warning) return;
    const t = window.setTimeout(() => setWarning(null), 6000);
    return () => window.clearTimeout(t);
  }, [warning]);

  // Rendered inside the pinned progress bar of ExamAnswersClient.
  return (
    <>
      {left !== null ? (
        <div
          role="timer"
          aria-live="off"
          aria-label={`Time left ${clock(left)}`}
          className={cn(
            "-mx-1 mb-2.5 flex items-center justify-between gap-3 rounded-xl px-3 py-1.5",
            left <= 60 ? "bg-red-50 text-red-900" : left <= 300 ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-800"
          )}
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            <Clock className="h-4 w-4" aria-hidden="true" />
            Time left
          </span>
          <span className="font-display text-xl font-semibold tabular-nums">{clock(left)}</span>
        </div>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {left !== null && left <= 60 && left > 0 ? "One minute left." : left !== null && left <= 300 && left > 0 ? "Five minutes left." : ""}
      </p>
      {warning ? (
        <div role="alert" className="-mx-1 mb-2.5 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <EyeOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {warning}
        </div>
      ) : null}
    </>
  );
}
