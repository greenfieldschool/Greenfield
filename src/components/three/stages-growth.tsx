"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useScroll, useMotionValueEvent } from "framer-motion";
import { ArrowRight, BookOpenCheck, GraduationCap, Sprout, type LucideIcon } from "lucide-react";
import { useInView, useSceneTier } from "./hooks";
import { cn } from "@/lib/cn";

const Scene = dynamic(() => import("./growing-tree-scene"), { ssr: false });

// Each stage's slice of the scene's timeline. The hero has already opened the flower (up to 0.31), so the story
// carries on from full bloom: petals fall and the sapling rises (creche), it branches out (primary), and the crown
// fills in and flowers (secondary).
type Stage = { name: string; ages: string; body: string; icon: LucideIcon; growth: string; from: number; to: number };

const stages: Stage[] = [
  {
    name: "Creche",
    ages: "Ages 0–4",
    body: "Warm, safe care with early learning routines that build confidence, language and social development.",
    icon: Sprout,
    growth: "Roots and first shoots",
    from: 0.32,
    to: 0.58
  },
  {
    name: "Primary",
    ages: "Ages 5–11",
    body: "Strong literacy and numeracy foundations, curiosity-driven learning and character formation.",
    icon: BookOpenCheck,
    growth: "Branching out",
    from: 0.58,
    to: 0.82
  },
  {
    name: "Secondary",
    ages: "Ages 12–16",
    body: "Subject mastery, critical thinking, leadership and structured preparation for the next stage.",
    icon: GraduationCap,
    growth: "Ready to flourish",
    from: 0.82,
    to: 1
  }
];

const STORY_MS = 6500;

function StageCard({ stage, index, className }: { stage: Stage; index: number; className?: string }) {
  return (
    <Link
      href="/academics"
      className={cn("group relative flex w-full flex-col overflow-hidden rounded-3xl border bg-white p-6 shadow-card transition duration-500 sm:p-8", className)}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-green-50 text-brand-green">
          <stage.icon className="h-6 w-6" aria-hidden="true" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold-700">
          Stage {index + 1} · {stage.growth}
        </span>
      </div>
      <div className="mt-6 flex items-baseline justify-between gap-4">
        <h3 className="font-display text-3xl font-semibold text-slate-900">{stage.name}</h3>
        <span className="text-sm font-medium text-slate-500">{stage.ages}</span>
      </div>
      <p className="mt-3 leading-relaxed text-slate-600">{stage.body}</p>
      <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green">
        Learn more
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}

/**
 * Phones and tablets: the three stages as full-screen stories, like a phone's stories. Each plays for a few seconds
 * while the tree grows through that stage, with bars at the top showing the time. Tap the right side for the next,
 * the left for the previous, swipe either way, or press and hold to pause. Plays only while on screen.
 */
function StageStories({ lite }: { lite: boolean }) {
  const progress = useRef(stages[0].from);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [ref, inView] = useInView<HTMLDivElement>("0px");
  const bars = useRef<Array<HTMLSpanElement | null>>([]);
  const elapsed = useRef(0);
  const press = useRef<{ x: number; t: number } | null>(null);
  // A swipe or a long press (pause) also ends in a click on a tap zone: that click must not move on as well.
  const ignoreClick = useRef(false);

  const go = (next: number) => {
    const i = Math.max(0, Math.min(stages.length - 1, next));
    elapsed.current = 0;
    setIndex(i);
  };

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (inView && !paused) elapsed.current = Math.min(1, elapsed.current + dt / STORY_MS);
      const s = stages[index];
      // The tree grows through this stage, easing out towards its end.
      progress.current = s.from + (s.to - s.from) * (1 - Math.pow(1 - elapsed.current, 2));
      bars.current.forEach((bar, i) => {
        if (bar) bar.style.transform = `scaleX(${i < index ? 1 : i > index ? 0 : elapsed.current})`;
      });
      if (elapsed.current >= 1 && index < stages.length - 1) {
        elapsed.current = 0;
        setIndex(index + 1);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [index, inView, paused]);

  const stage = stages[index];

  return (
    <div
      ref={ref}
      className="relative h-[80svh] min-h-[560px] select-none overflow-hidden rounded-[2rem] bg-gradient-to-b from-brand-green-50 via-white to-brand-gold-50 shadow-card ring-1 ring-slate-200/70"
      onPointerDown={(e) => {
        press.current = { x: e.clientX, t: performance.now() };
        setPaused(true);
      }}
      onPointerUp={(e) => {
        const start = press.current;
        press.current = null;
        setPaused(false);
        if (!start) return;
        const dx = e.clientX - start.x;
        const swiped = Math.abs(dx) > 40;
        ignoreClick.current = swiped || performance.now() - start.t > 350;
        if (swiped) go(index + (dx < 0 ? 1 : -1));
      }}
      onPointerCancel={() => {
        press.current = null;
        setPaused(false);
      }}
    >
      <div className="absolute inset-x-0 top-0 h-[62%]" aria-hidden="true">
        <Scene progress={progress} active={inView} lite={lite} />
      </div>

      {/* Time bars */}
      <div className="absolute inset-x-4 top-4 flex gap-1.5" aria-hidden="true">
        {stages.map((s, i) => (
          <span key={s.name} className="h-1 flex-1 overflow-hidden rounded-full bg-brand-green-900/15">
            <span
              ref={(el) => {
                bars.current[i] = el;
              }}
              className="block h-full origin-left scale-x-0 rounded-full bg-brand-green"
            />
          </span>
        ))}
      </div>

      {/* Tap zones: left = previous, right = next. A quick tap moves on; holding pauses. */}
      <button
        type="button"
        aria-label="Previous stage"
        className="absolute bottom-[38%] left-0 top-0 w-1/3"
        onClick={() => (ignoreClick.current ? (ignoreClick.current = false) : go(index - 1))}
      />
      <button
        type="button"
        aria-label="Next stage"
        className="absolute bottom-[38%] right-0 top-0 w-2/3"
        onClick={() => (ignoreClick.current ? (ignoreClick.current = false) : go(index + 1))}
      />

      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-white via-white/95 to-white/0 px-4 pb-4 pt-10">
        <div key={stage.name} className="gf-rise" aria-live="polite">
          <StageCard stage={stage} index={index} className="border-brand-green-200 shadow-lift" />
        </div>
      </div>
    </div>
  );
}

/**
 * "Three stages" section. The story the hero starts carries on here: the hibiscus drops its petals, a tree grows
 * from where it stood and flowers in full crown, as the visitor goes from creche to primary to secondary.
 * - Desktop: the scene is pinned beside the cards and scroll drives the growth.
 * - Phones and tablets: swipeable stories (see StageStories), with a lighter scene.
 * Reduced motion, Data Saver, weak devices and browsers without WebGL get the same content as simple cards.
 */
export function StagesGrowth() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const progress = useRef(stages[0].from);
  const [activeStage, setActiveStage] = useState(0);
  const tier = useSceneTier();
  const [canvasRef, inView] = useInView<HTMLDivElement>("100px");
  const [isLarge, setIsLarge] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsLarge(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start 70%", "end 60%"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const t = Math.max(0, Math.min(1, v * 1.08));
    progress.current = stages[0].from + t * (1 - stages[0].from);
    setActiveStage(v < 0.36 ? 0 : v < 0.7 ? 1 : 2);
  });

  const show3D = tier === "full" || tier === "lite";

  if (show3D && !isLarge) {
    return (
      <div ref={sectionRef}>
        <StageStories lite />
      </div>
    );
  }

  return (
    <div ref={sectionRef} className={cn("relative", show3D && "lg:grid lg:grid-cols-2 lg:gap-16")}>
      <ol className={cn(show3D ? "space-y-0" : "grid gap-6 md:grid-cols-3")}>
        {stages.map((s, i) => {
          const active = show3D && activeStage === i;
          return (
            <li key={s.name} className={cn(show3D && "flex min-h-[70vh] items-center")}>
              <StageCard
                stage={s}
                index={i}
                className={
                  show3D
                    ? active
                      ? "border-brand-green-200 opacity-100 shadow-lift"
                      : "border-slate-200/80 opacity-40"
                    : "border-slate-200/80 hover:-translate-y-1 active:scale-[0.99] hover:shadow-lift"
                }
              />
            </li>
          );
        })}
      </ol>

      {show3D ? (
        <div className="relative">
          <div
            ref={canvasRef}
            className="sticky top-[12vh] h-[76vh] overflow-hidden rounded-[2rem] bg-gradient-to-b from-brand-green-50 via-white to-brand-gold-50 ring-1 ring-slate-200/70"
            aria-hidden="true"
          >
            <Scene progress={progress} active={inView} lite={tier === "lite"} />
            <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center gap-2">
              {stages.map((s, i) => (
                <span
                  key={s.name}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-semibold transition",
                    i === activeStage ? "bg-brand-green text-white" : "bg-white/80 text-slate-500"
                  )}
                >
                  {s.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
