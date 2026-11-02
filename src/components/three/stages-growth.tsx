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
 * Phones and tablets: the section is pinned while you scroll through it (about two screens), like the hero. The scene
 * fills the top, the current stage's card sits under it, and scrolling grows the tree: petals fall and the sapling
 * rises (creche), it branches out (primary), the crown fills and flowers (secondary). Bars at the top show how far
 * along you are; each card changes as its stage begins.
 */
function StagesScrollPhone({ lite }: { lite: boolean }) {
  const section = useRef<HTMLDivElement | null>(null);
  const progress = useRef(stages[0].from);
  const [index, setIndex] = useState(0);
  const [canvasRef, inView] = useInView<HTMLDivElement>("0px");
  const bars = useRef<Array<HTMLSpanElement | null>>([]);

  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] });
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    // The last tenth of the scroll holds the finished tree before the page moves on.
    const t = Math.min(1, v / 0.9);
    progress.current = stages[0].from + t * (1 - stages[0].from);
    const n = stages.length;
    setIndex(Math.min(n - 1, Math.floor(t * n)));
    bars.current.forEach((bar, i) => {
      if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, t * n - i))})`;
    });
  });

  const stage = stages[index];

  return (
    <div ref={section} className="relative h-[320svh]">
      <div className="sticky top-[calc(var(--gf-header,72px)+8px)] flex h-[calc(100svh-7rem)] min-h-[520px] flex-col overflow-hidden rounded-[2rem] bg-gradient-to-b from-brand-green-50 via-white to-brand-gold-50 shadow-card ring-1 ring-slate-200/70 transition-[top] duration-300">
        {/* How far along the three stages you are */}
        <div className="absolute inset-x-4 top-4 z-10 flex gap-1.5" aria-hidden="true">
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
        <div ref={canvasRef} className="relative min-h-0 flex-1" aria-hidden="true">
          <Scene progress={progress} active={inView} lite={lite} />
        </div>
        <div className="relative px-4 pb-4">
          <div key={stage.name} className="gf-rise" aria-live="polite">
            <StageCard stage={stage} index={index} className="border-brand-green-200 shadow-lift" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * "Three stages" section. The story the hero starts carries on here: the hibiscus drops its petals, a tree grows
 * from where it stood and flowers in full crown, as the visitor goes from creche to primary to secondary.
 * - Desktop: the scene is pinned beside the cards and scroll drives the growth.
 * - Phones and tablets: pinned while you scroll, scene above the current card (see StagesScrollPhone), lighter scene.
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
        <StagesScrollPhone lite />
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
