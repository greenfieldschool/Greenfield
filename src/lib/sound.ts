// Portal sound effects: a few short, quiet sounds for key moments (work handed in, a mark or notice arriving, a
// celebration). Made with Web Audio, so there are no files to download on slow data. Browser only.
//
// On by default, except when the device asks for reduced motion. Each person can switch them off in the portal
// menu; the choice is remembered on that device (localStorage) and follows across open tabs. Nothing plays while
// the tab is hidden, and nothing plays until the person has touched the page (browsers block sound before that).
//
// Sound design notes (see .claude/skills/ui-ux-design/sound.md):
// - Phone speakers barely reproduce anything under ~400 Hz, so every sound sits between ~500 Hz and ~2.5 kHz, and
//   low "error" tones use a triangle wave whose overtones carry them on small speakers.
// - The ear is most sensitive around 2–4 kHz, so higher notes get less gain: the sounds are matched by how loud
//   they *seem*, not by their numbers.
// - Everything goes through one bus: a master gain and a limiter, so two sounds at once never clip or get loud.
// - A gate stops pile-ups: the same sound never repeats within 150 ms, and a more important sound (celebrate,
//   error) is not trampled by a lesser one (tap, success) that fires at the same moment.
// - On iPhone (Safari 16.4+) the audio session is "ambient": the ringer/silent switch mutes us and the person's
//   music or podcast keeps playing instead of being paused.
// - The audio hardware is released (context suspended) a few seconds after the last sound, which saves battery
//   and stops Bluetooth headphones waking up for nothing.

export type SoundName = "tap" | "success" | "error" | "notify" | "celebrate";

const KEY = "gf_portal_sound";
export const SOUND_CHANGE_EVENT = "gf-sound-change";

/** Higher wins when two sounds fire close together. */
const PRIORITY: Record<SoundName, number> = { tap: 0, success: 1, notify: 2, error: 3, celebrate: 4 };
const SAME_SOUND_GAP_MS = 150;
const BUSY_WINDOW_MS = 250;
const IDLE_SUSPEND_MS = 4000;

let ctx: AudioContext | null = null;
let bus: GainNode | null = null;
let lastPlayed: { name: SoundName; at: number; until: number } | null = null;
let suspendTimer: ReturnType<typeof setTimeout> | null = null;

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
  if (!on && ctx && ctx.state === "running") void ctx.suspend().catch(() => undefined);
}

/** Keeps the switch in step when it is changed in another tab. Returns a function that stops listening. */
export function watchSoundSetting(onChange: (on: boolean) => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) onChange(soundEnabled());
  };
  const onLocal = (e: Event) => onChange(Boolean((e as CustomEvent<boolean>).detail));
  window.addEventListener("storage", onStorage);
  window.addEventListener(SOUND_CHANGE_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(SOUND_CHANGE_EVENT, onLocal);
  };
}

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      // Safari 16.4+: respect the silent switch and mix with the person's own audio rather than interrupting it.
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = "ambient";
    } catch {
      // Older browsers: nothing to set.
    }
    try {
      ctx = new Ctor({ latencyHint: "interactive" });
    } catch {
      return null;
    }
    // One output bus: master level, then a limiter so stacked sounds can't clip.
    const master = ctx.createGain();
    master.gain.value = 0.9;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;
    master.connect(limiter).connect(ctx.destination);
    bus = master;
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && ctx?.state === "running") void ctx.suspend().catch(() => undefined);
    });
  }
  return ctx;
}

/** Call from a tap or key press: browsers only allow sound after the person has interacted with the page. */
export function unlockSound() {
  if (!soundEnabled()) return;
  const c = context();
  if (c && c.state === "suspended") void c.resume().catch(() => undefined);
}

type Note = { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number; to?: number };

function scheduleSuspend(afterSeconds: number) {
  if (suspendTimer) clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => {
    if (ctx && ctx.state === "running") void ctx.suspend().catch(() => undefined);
  }, afterSeconds * 1000 + IDLE_SUSPEND_MS);
}

// Each note: a 4 ms rise (no click, still crisp) and an exponential fade, the way a struck object decays.
function play(notes: Note[]) {
  const c = context();
  if (!c || !bus || c.state !== "running") return;
  const t0 = c.currentTime + 0.005;
  let end = 0;
  for (const n of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.setValueAtTime(n.freq, t0 + n.at);
    if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur);
    const peak = n.gain ?? 0.05;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(g).connect(bus);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    end = Math.max(end, n.at + n.dur);
  }
  scheduleSuspend(end);
  return end;
}

// Pitches are from one key (C major / A minor family) so sounds heard together never clash.
// Gains are matched by loudness as heard: higher notes get less.
const SOUNDS: Record<SoundName, Note[]> = {
  // A soft, short tick for a big button (Join). Felt more than heard.
  tap: [{ freq: 880, at: 0, dur: 0.04, gain: 0.025 }],
  // Two rising notes (a major third): saved, handed in.
  success: [
    { freq: 784, at: 0, dur: 0.1, type: "triangle", gain: 0.05 },
    { freq: 988, at: 0.075, dur: 0.16, type: "triangle", gain: 0.045 }
  ],
  // Two falling notes, gentle, not a buzzer. Triangle so a phone speaker can play them.
  error: [
    { freq: 523, at: 0, dur: 0.12, type: "triangle", gain: 0.055 },
    { freq: 440, at: 0.1, dur: 0.2, type: "triangle", gain: 0.055 }
  ],
  // A small bell: something new arrived. A quiet overtone gives it the "ding".
  notify: [
    { freq: 1319, at: 0, dur: 0.3, gain: 0.03 },
    { freq: 2637, at: 0, dur: 0.12, gain: 0.008 },
    { freq: 1047, at: 0.11, dur: 0.34, gain: 0.03 }
  ],
  // A quick rising arpeggio for a strong result (with the confetti).
  celebrate: [
    { freq: 523, at: 0, dur: 0.12, type: "triangle", gain: 0.045 },
    { freq: 659, at: 0.08, dur: 0.12, type: "triangle", gain: 0.042 },
    { freq: 784, at: 0.16, dur: 0.12, type: "triangle", gain: 0.04 },
    { freq: 1047, at: 0.24, dur: 0.3, type: "triangle", gain: 0.04 }
  ]
};

/** How long each sound lasts in seconds (for tests and for timing things against it). */
export function soundLength(name: SoundName): number {
  return Math.max(...SOUNDS[name].map((n) => n.at + n.dur));
}

function gateAllows(name: SoundName): boolean {
  const now = performance.now();
  if (lastPlayed) {
    if (lastPlayed.name === name && now - lastPlayed.at < SAME_SOUND_GAP_MS) return false;
    if (now < lastPlayed.until && PRIORITY[name] < PRIORITY[lastPlayed.name]) return false;
  }
  lastPlayed = { name, at: now, until: now + Math.min(BUSY_WINDOW_MS, soundLength(name) * 1000) };
  return true;
}

/** Plays a sound if the person has sounds on, the tab is visible and the browser allows it. Never throws. */
export function playSound(name: SoundName) {
  if (typeof document === "undefined" || document.hidden || !soundEnabled()) return;
  try {
    if (!gateAllows(name)) return;
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
