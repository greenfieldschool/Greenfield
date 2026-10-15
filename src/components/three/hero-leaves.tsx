"use client";

import dynamic from "next/dynamic";
import { useInView, useReducedMotion, useWebGLAvailable } from "./hooks";
import { cn } from "@/lib/cn";

// three.js is only downloaded in the browser, after the page has rendered.
const Scene = dynamic(() => import("./hero-leaves-scene"), { ssr: false });

export function HeroLeaves({ className }: { className?: string }) {
  const reduced = useReducedMotion();
  const webgl = useWebGLAvailable();
  const [ref, inView] = useInView<HTMLDivElement>();
  const enabled = webgl === true && !reduced;

  return (
    <div ref={ref} className={cn("pointer-events-none", className)} aria-hidden="true">
      {enabled ? <Scene active={inView} /> : null}
    </div>
  );
}
