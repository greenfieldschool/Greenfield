"use client";

import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * A card that tilts towards the mouse with a soft moving highlight, like a photo held in the hand. Only with a
 * mouse: touch screens get a gentle press instead, and reduced motion gets neither.
 */
export function Tilt({ children, className, max = 7, cursor = "View" }: { children: ReactNode; className?: string; max?: number; cursor?: string }) {
  const reduced = useReducedMotion();
  const rx = useSpring(0, { stiffness: 180, damping: 18 });
  const ry = useSpring(0, { stiffness: 180, damping: 18 });
  const gx = useMotionValue(50);
  const gy = useMotionValue(50);
  const glare = useMotionTemplate`radial-gradient(circle at ${gx}% ${gy}%, rgba(255,255,255,0.28), transparent 55%)`;

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      data-cursor={cursor}
      className={cn("group relative [transform-style:preserve-3d]", className)}
      style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }}
      // The inline transform would override a CSS active:scale, so the press is done here.
      whileTap={{ scale: 0.98 }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse") return;
        const r = e.currentTarget.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width;
        const py = (e.clientY - r.top) / r.height;
        ry.set((px - 0.5) * max * 2);
        rx.set(-(py - 0.5) * max * 2);
        gx.set(px * 100);
        gy.set(py * 100);
      }}
      onPointerLeave={() => {
        rx.set(0);
        ry.set(0);
      }}
    >
      {children}
      <motion.div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 can-hover:group-hover:opacity-100"
        style={{ backgroundImage: glare }}
      />
    </motion.div>
  );
}
