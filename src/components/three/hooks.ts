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

let webglSupport: boolean | undefined;

// Checked once per page load. The test context is released straight away: browsers only allow about 16 at once.
function detectWebGL() {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const canvas = document.createElement("canvas");
    const gl = window.WebGLRenderingContext ? canvas.getContext("webgl2") || canvas.getContext("webgl") : null;
    webglSupport = Boolean(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

/** WebGL can be missing (old devices, blocked GPU); scenes fall back to their static design. */
export function useWebGLAvailable() {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => setOk(detectWebGL()), []);
  return ok;
}

/**
 * How much 3D this device should get:
 * - "off": reduced motion, no WebGL, Data Saver on, or very little memory. Show the static design.
 * - "lite": phones and tablets (touch screen or narrow window). Fewer objects, lower resolution.
 * - "full": everything else.
 * `null` until the browser has been checked (and during server rendering), so nothing loads early.
 */
export type SceneTier = "off" | "lite" | "full";

export function useSceneTier(): SceneTier | null {
  const [tier, setTier] = useState<SceneTier | null>(null);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const touch = window.matchMedia("(pointer: coarse), (max-width: 767px)");
    const update = () => {
      const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
      const weak = Boolean(nav.connection?.saveData) || (nav.deviceMemory !== undefined && nav.deviceMemory <= 2);
      if (reduced.matches || weak || !detectWebGL()) setTier("off");
      else setTier(touch.matches ? "lite" : "full");
    };
    update();
    reduced.addEventListener("change", update);
    touch.addEventListener("change", update);
    return () => {
      reduced.removeEventListener("change", update);
      touch.removeEventListener("change", update);
    };
  }, []);
  return tier;
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
