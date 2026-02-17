"use client";

import { useEffect, useRef } from "react";

export default function LockOnBlurClient({
  attemptId,
  onLocked
}: {
  attemptId: string;
  onLocked?: () => void;
}) {
  const lockedRef = useRef(false);

  useEffect(() => {
    if (!attemptId) return;

    async function lock(reason: string) {
      if (lockedRef.current) return;
      lockedRef.current = true;

      try {
        await fetch("/portal/exams/lock", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ attemptId, reason })
        });
      } finally {
        onLocked?.();
      }
    }

    function onBlur() {
      lock("blur");
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        lock("visibility_hidden");
      }
    }

    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [attemptId, onLocked]);

  return null;
}
