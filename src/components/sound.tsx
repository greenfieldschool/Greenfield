"use client";

import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { SOUND_CHANGE_EVENT, playSound, setSoundEnabled, soundEnabled, unlockSound, type SoundName } from "@/lib/sound";

const NAMES: SoundName[] = ["tap", "success", "error", "notify", "celebrate"];

/**
 * Portal-wide: unlocks audio on the first tap or key press, and plays the sound named by data-sound="…" on any
 * element that is clicked (e.g. the Join button). Renders nothing.
 */
export function SoundEffects() {
  useEffect(() => {
    const unlock = () => unlockSound();
    const onClick = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.("[data-sound]");
      const name = el?.getAttribute("data-sound") as SoundName | null;
      if (name && NAMES.includes(name)) playSound(name);
    };
    window.addEventListener("pointerdown", unlock, { passive: true });
    window.addEventListener("keydown", unlock);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("click", onClick);
    };
  }, []);
  return null;
}

/** "Sounds on / off" for the portal menu. Plays a short sound when switched on, so people hear what they chose. */
export function SoundToggle({ className }: { className?: string }) {
  const [on, setOn] = useState<boolean | null>(null);
  useEffect(() => {
    setOn(soundEnabled());
    const sync = (e: Event) => setOn(Boolean((e as CustomEvent<boolean>).detail));
    window.addEventListener(SOUND_CHANGE_EVENT, sync);
    return () => window.removeEventListener(SOUND_CHANGE_EVENT, sync);
  }, []);
  if (on === null) return null;
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={on}
      onClick={() => {
        const next = !on;
        setSoundEnabled(next);
        setOn(next);
        if (next) {
          unlockSound();
          playSound("success");
        }
      }}
      className={className}
    >
      {on ? <Volume2 className="h-4 w-4 text-brand-green-600" aria-hidden="true" /> : <VolumeX className="h-4 w-4 text-slate-400" aria-hidden="true" />}
      <span className="flex-1 text-left">Sounds</span>
      <span className={on ? "text-xs font-semibold text-brand-green-700" : "text-xs font-semibold text-slate-500"}>{on ? "On" : "Off"}</span>
    </button>
  );
}

/**
 * Rings the bell sound when the unread count goes up while the person is using the portal (not on first load, and
 * not for notifications they've already been told about in this visit).
 */
export function BellChime({ count }: { count: number }) {
  useEffect(() => {
    let previous: number | null = null;
    try {
      const saved = window.sessionStorage.getItem("gf_bell_count");
      previous = saved === null ? null : Number(saved);
      window.sessionStorage.setItem("gf_bell_count", String(count));
    } catch {
      return;
    }
    if (previous !== null && count > previous) playSound("notify");
  }, [count]);
  return null;
}
