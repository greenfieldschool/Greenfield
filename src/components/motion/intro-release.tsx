"use client";

import { useEffect } from "react";

// Once the curtain has lifted and the hero has finished arriving, take the intro switch off the page, so later page
// changes animate at normal speed.
export function IntroRelease() {
  useEffect(() => {
    if (!document.documentElement.classList.contains("gf-intro-on")) return;
    const t = window.setTimeout(() => document.documentElement.classList.remove("gf-intro-on"), 3300);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
