"use client";

import { motion, useMotionTemplate, useReducedMotion, useScroll, useSpring, useTransform, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// Scroll-linked motion: depth (parallax), lines that draw, giant type that slides, a photo that grows to fill the
// screen, words that light up, and a page background that changes colour by section.
// All of it reads native scrolling (nothing is hijacked) and stays still for reduced motion.

function useCoarsePointer() {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(pointer: coarse)");
    const update = () => setCoarse(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return coarse;
}

/**
 * Moves its content against the scroll by up to `distance` px, so layers sit at different depths. Phones get half
 * the distance (small screens exaggerate it).
 */
export function Parallax({ children, distance = 60, className }: { children: ReactNode; distance?: number; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const d = reduced ? 0 : coarse ? distance / 2 : distance;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], [d, -d]);
  return (
    <motion.div ref={ref} style={{ y }} className={cn("will-change-transform", className)}>
      {children}
    </motion.div>
  );
}

/** A vertical line that fills from top to bottom as its parent scrolls through the screen (timelines, steps). */
export function ScrollLine({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 80%", "end 55%"] });
  const scaleY = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.4 });
  return (
    <div ref={ref} className={cn("pointer-events-none absolute w-px overflow-hidden bg-white/10", className)} aria-hidden="true">
      <motion.div className="h-full w-full origin-top bg-gradient-to-b from-brand-gold to-brand-gold-300" style={{ scaleY: reduced ? 1 : scaleY }} />
    </div>
  );
}

/**
 * Giant type that slides sideways as the page scrolls, two lines in opposite directions (the second in outline).
 * Decorative: the words are also said once in a visually hidden line for screen readers.
 */
export function ScrollMarquee({ words, className }: { words: string[]; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const left = useTransform(scrollYProgress, [0, 1], reduced ? ["0%", "0%"] : ["0%", "-30%"]);
  const right = useTransform(scrollYProgress, [0, 1], reduced ? ["-30%", "-30%"] : ["-30%", "0%"]);
  const line = Array.from({ length: 3 }, () => words.join(" · ")).join(" · ") + " ·";
  return (
    <div ref={ref} className={cn("overflow-hidden py-10 sm:py-16", className)}>
      <span className="sr-only">{words.join(", ")}</span>
      <motion.div aria-hidden="true" style={{ x: left }} className="whitespace-nowrap font-display text-[17vw] font-semibold leading-none sm:text-[11vw]">
        {line}
      </motion.div>
      <motion.div
        aria-hidden="true"
        style={{ x: right }}
        className="mt-2 whitespace-nowrap font-display text-[17vw] font-semibold italic leading-none text-transparent [-webkit-text-stroke:1.5px_currentColor] sm:text-[11vw]"
      >
        {line}
      </motion.div>
    </div>
  );
}

/**
 * A photo that starts as a rounded card in the middle of the page and grows to fill the screen edge to edge as it
 * scrolls up, settling from a slight zoom; `children` (a caption) fades in once it is full size.
 */
export function ExpandOnScroll({ children, media, className }: { children?: ReactNode; media: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const reduced = useReducedMotion();
  const coarse = useCoarsePointer();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "center center"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });
  const side = useTransform(p, [0, 1], reduced ? [0, 0] : [coarse ? 6 : 14, 0]);
  const vertical = useTransform(p, [0, 1], reduced ? [0, 0] : [10, 0]);
  const round = useTransform(p, [0, 1], reduced ? [0, 0] : [40, 0]);
  const clipPath = useMotionTemplate`inset(${vertical}% ${side}% ${vertical}% ${side}% round ${round}px)`;
  const scale = useTransform(p, [0, 1], reduced ? [1, 1] : [1.25, 1]);
  const captionOpacity = useTransform(p, [0.75, 1], reduced ? [1, 1] : [0, 1]);
  const captionY = useTransform(p, [0.75, 1], reduced ? [0, 0] : [30, 0]);
  return (
    <div ref={ref} className={cn("relative h-[85svh] min-h-[480px]", className)}>
      <motion.div style={{ clipPath }} className="absolute inset-0 overflow-hidden">
        <motion.div style={{ scale }} className="absolute inset-0">
          {media}
        </motion.div>
        <div className="absolute inset-0 bg-gradient-to-t from-brand-green-950/80 via-brand-green-950/10 to-transparent" />
        <motion.div style={{ opacity: captionOpacity, y: captionY }} className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-6 pb-12 sm:pb-16">
          {children}
        </motion.div>
      </motion.div>
    </div>
  );
}

function HighlightWord({ word, index, total, progress }: { word: string; index: number; total: number; progress: MotionValue<number> }) {
  const start = index / total;
  const opacity = useTransform(progress, [start, Math.min(1, start + 1.5 / total)], [0.18, 1]);
  return (
    <>
      <motion.span style={{ opacity }}>{word}</motion.span>{" "}
    </>
  );
}

/** A statement whose words light up one after another as it scrolls up the screen, like reading along. */
export function ScrollHighlight({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement | null>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 85%", "end 50%"] });
  const words = text.split(/\s+/).filter(Boolean);
  if (reduced)
    return (
      <p ref={ref} className={className}>
        {text}
      </p>
    );
  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <HighlightWord key={`${w}-${i}`} word={w} index={i} total={words.length} progress={scrollYProgress} />
      ))}
    </p>
  );
}

export type Tone = "deep" | "cream" | "mist" | "warm" | "white";

const TONES: Record<Tone, string> = {
  deep: "#062519",
  cream: "#F6F7F4",
  mist: "#EEF7F2",
  warm: "#FDF8E7",
  white: "#FFFFFF"
};

/**
 * The page background behind sections marked `data-tone`: as each section's top passes two-thirds of the way up the
 * screen, the whole page eases to its colour (deep green for the dark bands; cream, mist, warm or white for the rest).
 * Switching that early means a section's text never arrives on the previous section's colour. Put one per page, and
 * leave those sections without a background of their own.
 */
export function ToneBackdrop({ initial = "cream" }: { initial?: Tone }) {
  const [tone, setTone] = useState<Tone>(initial);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const line = window.innerHeight * 0.65;
      let current: Tone = initial;
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("[data-tone]"))) {
        if (el.getBoundingClientRect().top < line) current = el.dataset.tone as Tone;
      }
      setTone(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [initial]);
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 transition-colors duration-700 ease-out motion-reduce:transition-none"
      style={{ backgroundColor: TONES[tone] }}
    />
  );
}
