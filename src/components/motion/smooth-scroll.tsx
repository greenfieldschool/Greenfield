"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import type Lenis from "lenis";

/**
 * Smooth, weighted scrolling for the public site on computers with a mouse or trackpad (Lenis). It moves the real
 * page scroll, so sticky sections, framer's useScroll and the browser's own scrollbar all keep working. Phones and
 * tablets keep their native scrolling, and reduced motion turns it off. Add `data-lenis-prevent` to anything that
 * should scroll on its own (a menu, a map).
 */
export function SmoothScroll() {
  const pathname = usePathname();
  const lenis = useRef<Lenis | null>(null);
  const firstPath = useRef(true);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let stopped = false;
    let frame = 0;
    import("lenis").then(({ default: LenisClass }) => {
      if (stopped) return;
      const instance = new LenisClass({ duration: 1.15, easing: (t: number) => 1 - Math.pow(1 - t, 4), anchors: true });
      lenis.current = instance;
      const loop = (t: number) => {
        instance.raf(t);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      lenis.current?.destroy();
      lenis.current = null;
    };
  }, []);

  // Moving to another page starts it at the top (Lenis would otherwise glide from the old position).
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    if (!window.location.hash) lenis.current?.scrollTo(0, { immediate: true });
  }, [pathname]);

  return null;
}
