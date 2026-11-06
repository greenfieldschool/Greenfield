// Portal sound effects: a few short, quiet sounds for key moments (work handed in, a mark or notice arriving, a
// celebration). Made with Web Audio, so there are no files to download on slow data. Browser only.
//
// On by default, except when the device asks for reduced motion. Each person can switch them off in the portal
// menu; the choice is remembered on that device (localStorage). Nothing plays while the tab is hidden, and nothing
// plays until the person has touched the page (browsers block sound before that anyway).

export type SoundName = "tap" | "success" | "error" | "notify" | "celebrate";

const KEY = "gf_portal_sound";
export const SOUND_CHANGE_EVENT = "gf-sound-change";

let ctx: AudioContext | null = null;

export function soundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved === "on") return true;
    if (saved === "off") return false;
  } catch {
    // Private mode or storage blocked: fall back to the default below.
  }
  return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function setSoundEnabled(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // Can't remember it on this device; it still applies until the page is closed.
  }
  window.dispatchEvent(new CustomEvent(SOUND_CHANGE_EVENT, { detail: on }));
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  return ctx;
}

/** Call from a tap or key press: browsers only allow sound after the person has interacted with the page. */
export function unlockSound() {
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => undefined);
}

type Note = { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number; to?: number };

// Each note: a quick rise (5 ms) and a smooth fade, so nothing clicks.
function play(notes: Note[]) {
  const c = context();
  if (!c || c.state !== "running") return;
  const master = c.createGain();
  master.gain.value = 1;
  master.connect(c.destination);
  const t0 = c.currentTime + 0.01;
  for (const n of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.setValueAtTime(n.freq, t0 + n.at);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur);
    const peak = n.gain ?? 0.05;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(g).connect(master);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
  }
}

const SOUNDS: Record<SoundName, Note[]> = {
  // A soft click for a big button (Join).
  tap: [{ freq: 740, at: 0, dur: 0.05, gain: 0.035 }],
  // Two rising notes: saved, handed in.
  success: [
    { freq: 1046.5, at: 0, dur: 0.11, type: "triangle", gain: 0.05 },
    { freq: 1318.5, at: 0.08, dur: 0.16, type: "triangle", gain: 0.05 }
  ],
  // Two low falling notes, gentle: something didn't work.
  error: [
    { freq: 330, at: 0, dur: 0.12, gain: 0.05 },
    { freq: 247, at: 0.1, dur: 0.18, gain: 0.05 }
  ],
  // A small bell: something new arrived.
  notify: [
    { freq: 1568, at: 0, dur: 0.32, gain: 0.035 },
    { freq: 2349, at: 0, dur: 0.22, gain: 0.015 },
    { freq: 1175, at: 0.12, dur: 0.34, gain: 0.03 }
  ],
  // A quick rising arpeggio for a strong result (with the confetti).
  celebrate: [
    { freq: 523.3, at: 0, dur: 0.12, type: "triangle", gain: 0.045 },
    { freq: 659.3, at: 0.08, dur: 0.12, type: "triangle", gain: 0.045 },
    { freq: 784, at: 0.16, dur: 0.12, type: "triangle", gain: 0.045 },
    { freq: 1046.5, at: 0.24, dur: 0.28, type: "triangle", gain: 0.05 }
  ]
};

/** Plays a sound if the person has sounds on, the tab is visible and the browser allows it. Never throws. */
export function playSound(name: SoundName) {
  if (typeof document === "undefined" || document.hidden || !soundEnabled()) return;
  try {
    const c = context();
    if (c?.state === "suspended") {
      // Allowed only if the person has already interacted with this page; otherwise it stays quiet.
      void c.resume().then(() => play(SOUNDS[name]), () => undefined);
      return;
    }
    play(SOUNDS[name]);
  } catch {
    // Sound is a nicety: never let it break the page.
  }
}
