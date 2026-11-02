"use client";

import { motion, useMotionValue, useSpring } from "framer-motion";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

type Mode = "idle" | "link" | "label" | "hidden";

/**
 * Public site, mouse or trackpad only: a small gold dot that follows the pointer exactly and a ring that trails it.
 * Over links and buttons the ring grows; over anything with `data-cursor="View"` (or "Drag", "Scroll") it fills and
 * shows that word, so visitors know what will happen. Over text fields the normal cursor comes back. Touch screens and
 * reduced motion keep the normal cursor.
 */
export function CustomCursor() {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<Mode>("hidden");
  const [label, setLabel] = useState("");
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 350, damping: 32, mass: 0.6 });
  const ry = useSpring(y, { stiffness: 350, damping: 32, mass: 0.6 });

  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;
    setEnabled(true);
    document.documentElement.classList.add("gf-cursor");

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      x.set(e.clientX);
      y.set(e.clientY);
      const el = e.target instanceof Element ? e.target : null;
      if (el?.closest("input, textarea, select, [contenteditable='true'], iframe")) return setMode("hidden");
      const labelled = el?.closest<HTMLElement>("[data-cursor]");
      const link = el?.closest("a, button, [role='button'], label, summary");
      // A word wins unless the pointer is on a link inside the labelled area (e.g. a button in the hero).
      if (labelled && (!link || link.contains(labelled))) {
        setLabel(labelled.dataset.cursor ?? "");
        setMode("label");
      } else if (link) setMode("link");
      else setMode("idle");
    };
    const onLeave = () => setMode("hidden");
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      document.documentElement.classList.remove("gf-cursor");
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [x, y]);

  if (!enabled) return null;

  const ring = mode === "label" ? 76 : mode === "link" ? 52 : 34;
  return (
    <div aria-hidden="true" className={cn("pointer-events-none fixed inset-0 z-[70] transition-opacity duration-200", mode === "hidden" && "opacity-0")}>
      <motion.div style={{ x: rx, y: ry }} className="absolute left-0 top-0">
        <div
          className={cn(
            "flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-[11px] font-semibold uppercase tracking-[0.14em] transition-[width,height,background-color,border-color] duration-300 ease-out",
            mode === "label"
              ? "border-transparent bg-brand-gold text-brand-green-950"
              : mode === "link"
                ? "border-brand-gold bg-brand-gold/10"
                : "border-white/80 mix-blend-difference"
          )}
          style={{ width: ring, height: ring }}
        >
          {mode === "label" ? label : null}
        </div>
      </motion.div>
      <motion.div style={{ x, y }} className="absolute left-0 top-0">
        <div className={cn("h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-gold transition-opacity", mode === "label" && "opacity-0")} />
      </motion.div>
    </div>
  );
}

/**
 * A button or link that leans towards the mouse when it comes near, then springs back: the main calls to action.
 * Mouse only; still for touch and reduced motion.
 */
export function Magnetic({ children, strength = 0.3, className }: { children: React.ReactNode; strength?: number; className?: string }) {
  const mx = useSpring(0, { stiffness: 220, damping: 16, mass: 0.4 });
  const my = useSpring(0, { stiffness: 220, damping: 16, mass: 0.4 });
  return (
    <motion.span
      className={cn("inline-flex", className)}
      style={{ x: mx, y: my }}
      onPointerMove={(e) => {
        if (e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
        const r = e.currentTarget.getBoundingClientRect();
        mx.set((e.clientX - (r.left + r.width / 2)) * strength);
        my.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}
