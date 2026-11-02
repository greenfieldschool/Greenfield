"use client";

import { useEffect } from "react";

// Opens the question a "Help" link points at (/portal/help#report-held): a <details> can't open itself from the
// address, so this does it on load and whenever the # part changes, then brings it into view.
export function HelpOpener() {
  useEffect(() => {
    const open = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (!el) return;
      if (el instanceof HTMLDetailsElement) el.open = true;
      el.scrollIntoView({ block: "start" });
    };
    open();
    window.addEventListener("hashchange", open);
    return () => window.removeEventListener("hashchange", open);
  }, []);
  return null;
}
