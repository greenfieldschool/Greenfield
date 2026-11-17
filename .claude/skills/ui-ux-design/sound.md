# UI sound

Read before adding, changing or wiring any sound. Sound is the most intrusive thing an interface can do: it reaches
people who are not looking at the screen (a classroom, a church, a sleeping baby). Every sound must earn that.

## Where it lives
- `src/lib/sound.ts`: the engine (Web Audio synthesis, no files). `playSound(name)`, `soundEnabled()`,
  `setSoundEnabled()`, `watchSoundSetting()`, `unlockSound()`, `soundLength()`.
- `src/components/sound.tsx`: `SoundEffects` (unlock on first touch, `data-sound` clicks), `SoundToggle` (portal
  menu), `BellChime` (unread count rose during the visit).
- Wired in: portal `ToastProvider sound`, `Celebrate`, `BellChime`, `SubmitButton sound="tap"` on Join buttons.
- **Portal only.** Staff screens (`/admin`, `/conductor`) are silent: staff work in offices and classrooms all day,
  and a sound on every save would be heard hundreds of times. `ToastProvider` in the admin layout has no `sound`.

## When sound helps (and when it doesn't)
Use sound only for:
1. **Confirmation of something the person can't see finish**: work handed in, a payment recorded (`success`).
2. **An event that arrives while they're looking elsewhere on the page**: a new notification (`notify`).
3. **Failure that needs attention**: an action didn't work (`error`), always with a message on screen.
4. **Celebration of a real achievement**: a strong result, once per visit (`celebrate`).
5. **Feedback on a big, consequential tap** where latency could make people tap twice: Join a class (`tap`).

Never for: routine navigation (tabs, links, menus, scrolling), typing, hover, page loads, every toast on staff
screens, anything repeating on a timer, or anything in a hidden tab. Sound never carries meaning alone: the screen
always says the same thing in words.

## The sound palette (keep it small and coherent)
| Name | Character | Length | Notes (Hz) |
|---|---|---|---|
| tap | soft tick | 40 ms | 880 |
| success | two rising notes, a major third | ~235 ms | 784 → 988 |
| error | two falling notes, gentle, not a buzzer | ~300 ms | 523 → 440 (triangle) |
| notify | small bell with a faint overtone | ~450 ms | 1319 + 2637, then 1047 |
| celebrate | rising arpeggio | ~540 ms | 523, 659, 784, 1047 |
All pitches sit in one key (C major / A minor) so two sounds heard together never clash. A new sound joins this
table and this key, or it doesn't ship.

## Engineering rules
- **Duration**: feedback ≤ 150 ms, confirmations ≤ 300 ms, notifications ≤ 500 ms, celebrations ≤ 600 ms. Nothing
  longer; no loops.
- **Envelope**: 2–5 ms attack (shorter clicks, longer feels late), exponential decay like a struck object. Never
  start or stop a waveform abruptly (clicks).
- **Frequency**: phone speakers reproduce almost nothing below ~400 Hz and peak around 1–3 kHz. Keep fundamentals
  between ~500 Hz and ~2.5 kHz. Use triangle waves for lower notes: their odd overtones make them audible on small
  speakers. Avoid sustained energy at 2–5 kHz (where the ear is most sensitive and sound becomes shrill); any
  overtone there is short and very quiet.
- **Loudness**: match by perceived loudness, not by gain number. Higher notes get less gain. Peak gains 0.025–0.055
  per voice. The bus has a master gain (0.9) and a limiter (DynamicsCompressor, threshold −18 dB, ratio 12) so
  stacked sounds can't clip or get loud.
- **No pile-ups**: the gate in `playSound` drops a repeat of the same sound within 150 ms, and a lower-priority
  sound fired while a higher one is still sounding (priority: tap < success < notify < error < celebrate). So a
  success toast and the confetti together play only the celebration.
- **Fatigue**: a sound heard 20 times a day must be nearly subliminal (`tap`). The more frequent, the shorter and
  quieter. If a sound could fire more than once a minute in normal use, it shouldn't exist.
- **Battery and Bluetooth**: suspend the `AudioContext` a few seconds after the last sound and when the tab is
  hidden. A running context keeps the audio hardware (and Bluetooth headphones) awake.

## Respecting the person and the device
- **Switch**: portal menu → Sounds (`localStorage gf_portal_sound`), followed across tabs (`storage` event). Off by
  default when the device asks for reduced motion (people sensitive to motion are often sensitive to sound too).
- **iPhone silent switch**: Safari 16.4+ `navigator.audioSession.type = "ambient"`: the ringer switch mutes us and
  the person's music or podcast keeps playing (the default "auto" session can pause their audio). Older iOS can't
  be detected: that's why sounds are short and quiet.
- **Autoplay rules**: browsers block audio until the person taps or presses a key on the page. `SoundEffects`
  resumes the context on the first `pointerdown`/`keydown`. Never try to play on page load; never show an "enable
  sound" prompt.
- **Hidden tabs** never play. **Several tabs**: the hidden ones are silent, so only the one being looked at chimes.
- Never play sound for something the person didn't cause or wasn't expecting, except `notify`.

## Pairing with motion and haptics
- Sound starts with the visual change (within ~20 ms), not after the animation ends: the toast slide-in and the
  success notes start together; the confetti burst and the arpeggio start together.
- Haptics (`navigator.vibrate`) are Android-only and ignored on iPhone; if ever used: ≤ 15 ms, only alongside
  `tap`, only when sounds are on. Not used today.

## Checking it
- Without speakers: in the preview, wrap `AudioContext.prototype.createOscillator` and count calls, or check
  `soundLength()`. Fire `success` and `celebrate` together: only the celebration's notes should start.
- Listen on a real phone speaker at half volume in a quiet room and at full volume: nothing shrill, error audible.
- Switch off in one tab: the other tab's menu shows Off after focus.
- Hide the tab and trigger a notification: silence.
