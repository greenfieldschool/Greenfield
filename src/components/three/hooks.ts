"use client";

import { useCallback, useEffect, useState } from "react";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

/**
 * True while the element is on (or near) screen, so 3D scenes stop rendering when scrolled away.
 * Returns a callback ref, so it also works for elements that mount later (conditional rendering).
 */
export function useInView<T extends Element>(rootMargin = "200px") {
  const [el, setEl] = useState<T | null>(null);
  const [inView, setInView] = useState(false);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [el, rootMargin]);
  return [ref, inView] as const;
}

/** WebGL can be missing (old devices, blocked GPU); scenes fall back to their static design. */
export function useWebGLAvailable() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setOk(Boolean(window.WebGLRenderingContext && (canvas.getContext("webgl2") || canvas.getContext("webgl"))));
    } catch {
      setOk(false);
    }
  }, []);
  return ok;
}

/** Deterministic pseudo-random generator so scenes look the same on every visit. */
export function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
