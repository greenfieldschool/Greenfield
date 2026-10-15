"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Move3d } from "lucide-react";
import { useInView, useReducedMotion, useWebGLAvailable } from "./hooks";
import type { RingPhoto } from "./photo-ring-scene";
import { cn } from "@/lib/cn";

const Scene = dynamic(() => import("./photo-ring-scene"), { ssr: false });

/**
 * Optional 3D "carousel ring" of school photos. Drag to spin. Hidden for reduced-motion users and
 * browsers without WebGL (the normal photo grid below it always shows every photo).
 */
export function PhotoRing({ photos, className }: { photos: RingPhoto[]; className?: string }) {
  const reduced = useReducedMotion();
  const webgl = useWebGLAvailable();
  const [ref, inView] = useInView<HTMLDivElement>();
  const [front, setFront] = useState(0);

  if (reduced || webgl === false || photos.length < 3) return null;

  return (
    <section ref={ref} className={cn("relative overflow-hidden rounded-[2rem] bg-brand-green-950", className)} aria-label="3D photo carousel">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-brand-gold/15 blur-3xl" aria-hidden="true" />
      <div className="h-[420px] sm:h-[480px]">{webgl ? <Scene photos={photos} active={inView} onFrontChange={setFront} /> : null}</div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 bg-gradient-to-t from-brand-green-950 via-brand-green-950/70 to-transparent px-6 pb-6 pt-16 text-center">
        <p className="max-w-xl text-sm font-medium text-white" aria-live="polite">
          {photos[front]?.alt}
        </p>
        <span className="inline-flex items-center gap-1.5 text-xs text-brand-green-200">
          <Move3d className="h-3.5 w-3.5" aria-hidden="true" />
          Drag to spin
        </span>
      </div>
    </section>
  );
}
