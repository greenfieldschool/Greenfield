"use client";

import { animate, useInView, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState } from "react";

/**
 * Counts up to the number inside `value` the first time it scrolls into view, keeping any
 * prefix/suffix ("12:1" counts the 12, "30+" counts the 30). Non-numeric values render as-is.
 */
export function CountUp({ value, className }: { value: string; className?: string }) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const match = value.match(/^(\D*)(\d+)(.*)$/);
  const target = match ? Number(match[2]) : null;
  const [display, setDisplay] = useState(match && !reduced ? `${match[1]}0${match[3]}` : value);

  useEffect(() => {
    if (!match || target === null || reduced || !inView) {
      if (reduced) setDisplay(value);
      return;
    }
    const controls = animate(0, target, {
      duration: 1.4,
      ease: [0.2, 0.7, 0.2, 1],
      onUpdate: (v) => setDisplay(`${match[1]}${Math.round(v)}${match[3]}`)
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, reduced, target]);

  return (
    <span ref={ref} className={className} aria-label={value}>
      {display}
    </span>
  );
}
