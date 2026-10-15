"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useScroll, useMotionValueEvent } from "framer-motion";
import { ArrowRight, BookOpenCheck, GraduationCap, Sprout, type LucideIcon } from "lucide-react";
import { useInView, useReducedMotion, useWebGLAvailable } from "./hooks";
import { cn } from "@/lib/cn";

const Scene = dynamic(() => import("./growing-tree-scene"), { ssr: false });

type Stage = { name: string; ages: string; body: string; icon: LucideIcon; growth: string };

const stages: Stage[] = [
  {
    name: "Creche",
    ages: "Ages 0–4",
    body: "Warm, safe care with early learning routines that build confidence, language and social development.",
    icon: Sprout,
    growth: "Roots and first shoots"
  },
  {
    name: "Primary",
    ages: "Ages 5–11",
    body: "Strong literacy and numeracy foundations, curiosity-driven learning and character formation.",
    icon: BookOpenCheck,
    growth: "Branching out"
  },
  {
    name: "Secondary",
    ages: "Ages 12–16",
    body: "Subject mastery, critical thinking, leadership and structured preparation for the next stage.",
    icon: GraduationCap,
    growth: "Ready to flourish"
  }
];

/**
 * "Three stages" section. On large screens a 3D tree grows from seedling to full crown as the
 * visitor scrolls past creche → primary → secondary. Phones, reduced-motion users and browsers
 * without WebGL get the same content as simple cards.
 */
export function StagesGrowth() {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const progress = useRef(0.08);
  const [activeStage, setActiveStage] = useState(0);
  const reduced = useReducedMotion();
  const webgl = useWebGLAvailable();
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
    progress.current = Math.max(0.08, Math.min(1, v * 1.08));
    setActiveStage(v < 0.36 ? 0 : v < 0.7 ? 1 : 2);
  });

  const show3D = isLarge && webgl === true && !reduced;

  return (
    <div ref={sectionRef} className={cn("relative", show3D && "lg:grid lg:grid-cols-2 lg:gap-16")}>
      <ol className={cn(show3D ? "space-y-0" : "grid gap-6 md:grid-cols-3")}>
        {stages.map((s, i) => {
          const active = show3D && activeStage === i;
          return (
            <li key={s.name} className={cn(show3D && "flex min-h-[70vh] items-center")}>
              <Link
                href="/academics"
                className={cn(
                  "group relative flex w-full flex-col overflow-hidden rounded-3xl border bg-white p-8 shadow-card transition duration-500",
                  show3D
                    ? active
                      ? "border-brand-green-200 opacity-100 shadow-lift"
                      : "border-slate-200/80 opacity-40"
                    : "border-slate-200/80 hover:-translate-y-1 hover:shadow-lift"
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-green-50 text-brand-green">
                    <s.icon className="h-6 w-6" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold-700">
                    Stage {i + 1} · {s.growth}
                  </span>
                </div>
                <div className="mt-6 flex items-baseline justify-between gap-4">
                  <h3 className="font-display text-3xl font-semibold text-slate-900">{s.name}</h3>
                  <span className="text-sm font-medium text-slate-500">{s.ages}</span>
                </div>
                <p className="mt-3 leading-relaxed text-slate-600">{s.body}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green">
                  Learn more
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ol>

      {show3D ? (
        <div className="relative hidden lg:block">
          <div
            ref={canvasRef}
            className="sticky top-[12vh] h-[76vh] overflow-hidden rounded-[2rem] bg-gradient-to-b from-brand-green-50 via-white to-brand-gold-50 ring-1 ring-slate-200/70"
            aria-hidden="true"
          >
            <Scene progress={progress} active={inView} />
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
