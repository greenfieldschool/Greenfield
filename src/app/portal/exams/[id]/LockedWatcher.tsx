"use client";

import { useEffect } from "react";

// On the "Your exam is locked" screen: asks every 8 seconds whether the supervisor has unlocked the learner, and
// reloads the page as soon as they have, so the exam opens again by itself. (A soft router.refresh() didn't redraw
// this page reliably.) While locked, the check-in changes nothing; it only reports the state.
export default function LockedWatcher({ attemptId }: { attemptId: string }) {
  useEffect(() => {
    const t = window.setInterval(async () => {
      try {
        const res = await fetch("/portal/exams/checkin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId, event: "heartbeat" })
        });
        const data = (await res.json().catch(() => null)) as { ok: boolean; locked: boolean; submitted: boolean } | null;
        if (data?.ok && (!data.locked || data.submitted)) window.location.reload();
      } catch {
        // Offline: try again next time.
      }
    }, 8000);
    return () => window.clearInterval(t);
  }, [attemptId]);
  return null;
}
