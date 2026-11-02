"use client";

import dynamic from "next/dynamic";
import { useInView, useSceneTier } from "./hooks";
import { cn } from "@/lib/cn";

// three.js is only downloaded in the browser, after the page has rendered.
const Scene = dynamic(() => import("./hero-leaves-scene"), { ssr: false });

export function HeroLeaves({ className }: { className?: string }) {
  const tier = useSceneTier();
  const [ref, inView] = useInView<HTMLDivElement>();

  return (
    <div ref={ref} className={cn("pointer-events-none", className)} aria-hidden="true">
      {tier === "lite" || tier === "full" ? <Scene active={inView} lite={tier === "lite"} /> : null}
    </div>
  );
}
