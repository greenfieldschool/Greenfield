import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";

/**
 * Headline words that rise out of a mask one after another on page load. Pure CSS (works in server components and
 * before the page's scripts load); switched off for reduced motion in globals.css. `start` continues the
 * stagger from an earlier TextReveal in the same headline, so two styles of text can rise as one sentence.
 */
export function TextReveal({
  text,
  className,
  start = 0,
  delay = 0,
  step = 70
}: {
  text: string;
  className?: string;
  start?: number;
  delay?: number;
  step?: number;
}) {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <>
      {words.map((word, i) => (
        <span key={`${word}-${i}`}>
          <span className="gf-word">
            <span className={className} style={{ "--d": `${delay + (start + i) * step}ms` } as CSSProperties}>
              {word}
            </span>
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </>
  );
}

/** The style for an element that rises in after `ms` (eyebrows, paragraphs, buttons under a TextReveal). */
export function riseDelay(ms: number) {
  return { "--d": `${ms}ms` } as CSSProperties;
}

/** A hand-drawn gold stroke under a word, drawn after `delay` ms. Place inside a `relative inline-block` wrapper. */
export function BrushUnderline({ delay = 0, className }: { delay?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 300 24"
      preserveAspectRatio="none"
      aria-hidden="true"
      className={cn("gf-draw pointer-events-none absolute -bottom-[0.12em] left-0 h-[0.32em] w-full", className)}
      style={riseDelay(delay)}
    >
      <path
        d="M4 17 C 60 7, 120 5, 170 9 S 260 18, 296 8"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth={5}
        strokeLinecap="round"
      />
    </svg>
  );
}
