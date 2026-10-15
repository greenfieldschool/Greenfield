"use client";

import { useEffect } from "react";

/**
 * Small gold-and-green confetti burst for a strong result (default ≥ 70%). Fires once per visit
 * to the page, and never for reduced-motion users.
 */
export function Celebrate({ percent, threshold = 70 }: { percent: number; threshold?: number }) {
  useEffect(() => {
    if (!(percent >= threshold)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cancelled = false;
    import("canvas-confetti").then(({ default: confetti }) => {
      if (cancelled) return;
      const colors = ["#D4A017", "#EDC54C", "#2F8560", "#7FC2A0", "#ffffff"];
      confetti({ particleCount: 90, spread: 75, startVelocity: 38, origin: { y: 0.35 }, colors, scalar: 0.9 });
      setTimeout(() => {
        if (!cancelled) confetti({ particleCount: 50, spread: 110, startVelocity: 28, origin: { y: 0.3 }, colors, scalar: 0.8 });
      }, 350);
    });
    return () => {
      cancelled = true;
    };
  }, [percent, threshold]);

  return null;
}
