"use client";

import dynamic from "next/dynamic";
import { useInView, useSceneTier } from "./hooks";
import { cn } from "@/lib/cn";

const Scene = dynamic(() => import("./field-backdrop-scene"), { ssr: false });

/**
 * A rippling "green field" of light points used behind the sign-in pages. Sits absolutely inside
 * a `relative` dark container; renders nothing for reduced-motion users, without WebGL or on Data Saver; phones get a lighter field.
 */
export function FieldBackdrop({ className }: { className?: string }) {
  const tier = useSceneTier();
  const [ref, inView] = useInView<HTMLDivElement>("0px");

  return (
    <div ref={ref} className={cn("pointer-events-none absolute inset-0", className)} aria-hidden="true">
      {tier === "lite" || tier === "full" ? <Scene active={inView} lite={tier === "lite"} /> : null}
      <div className="absolute inset-0 bg-gradient-to-b from-brand-green-950/60 via-transparent to-brand-green-950/80" />
    </div>
  );
}
