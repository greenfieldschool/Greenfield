# Motion and 3D (three.js)

Read this before adding or changing any animation, transition or 3D scene. Most visitors are parents on phones,
often mid-range Android on mobile data, so every animation has to earn its cost there first.

## What we have
- **Libraries**: `three` 0.169, `@react-three/fiber` 8 (React Three Fiber, "R3F"), `@react-three/drei` 9, and
  `framer-motion` 11 (scroll progress, page motion). Don't add a second animation library (GSAP, anime.js …) for
  something these can do.
- **Versions are pinned by React 18 / Next 14.** R3F 9, drei 10 and `@react-three/postprocessing` 3 need React 19.
  Upgrade them only together with Next 15 / React 19, never on their own. If you need postprocessing now, it is
  `@react-three/postprocessing@2`.
- **Scenes** in `src/components/three/`. Each has a light wrapper (`hero-bloom.tsx`, `stages-growth.tsx`) and a
  heavy scene (`growing-tree-scene.tsx`) loaded with `next/dynamic(..., { ssr: false })`, so three.js is only downloaded in the
  browser, after the page shows.

  | Scene | Where | Phones |
  |---|---|---|
  | `HeroBloom` (`growing-tree-scene` with `variant="hero"`): the first screen is pinned for about two screens while a hibiscus bud opens into full bloom (scene progress 0.06 → 0.31), with pollen (`Sparkles`) and a camera that moves in and follows the mouse; the headline drifts away and a closing line comes in. Reduced motion: not pinned, photo slideshow. `off` tier: pinned, photos | home hero | lite scene; the camera steps back on tall screens and `frame` puts the flower above the text |
  | `StagesGrowth` (`variant="stages"`): the story carries on from full bloom: petals fall and a sapling rises (creche, 0.32–0.58), it branches (primary, –0.82), the crown fills and flowers (secondary, –1); scroll drives it beside pinned cards | home "three stages" | `StagesScrollPhone`: pinned for about two screens while scroll grows the tree, scene on top, the current stage's card below, bars showing progress (people expect scroll to drive it, as on desktop; tap-through stories were tried and felt broken); one branching level less, fewer larger leaves, 200 grass blades, dpr 1.25 |
  The flower and the tree share one timeline (`BLOOM`, `PETAL_FALL`, `WILT`, `TREE`, `CAMERA` in the scene): keep the
  hero's end and the stages' start on the same number so the story joins up.
  | `PhotoRing`: drag-to-spin drei `<Image>` ring | gallery | lite: 640px photos (1080px on desktop); the photo grid below always shows every photo |
  | `FieldBackdrop`: shader point field | admin, portal and conductor login | lite: 4,000 slightly larger points instead of 7,700, dpr 1.25 |
- **Hooks** (`three/hooks.ts`): `useSceneTier()` returns `"off" | "lite" | "full"` (or `null` before the browser is
  checked). "off" means reduced motion, no WebGL, Data Saver or 2GB of memory or less; "lite" means a touch screen
  or a window under 768px. Every scene wrapper uses it. Also `useInView` (callback ref), `seeded` (the same
  "random" scene on every visit), `useReducedMotion`, and `useWebGLAvailable`, which checks once per page load and
  releases the test WebGL context.
- **CSS**: `animate-fade-up` and `animate-toast-in` in `globals.css` (both switched off for reduced motion),
  `animate-spin` and `animate-pulse` for loading.

## Rules for 3D
1. **3D is decoration.** The page must be complete and readable without it: put the content in HTML, mark the
   canvas `aria-hidden`, and give it a static fallback (gradient, photo or cards). Never put text, prices or buttons
   only inside a canvas.
2. **Load late, render only on screen.** Use `next/dynamic` with `ssr: false`, mount only when WebGL is available
   and motion isn't reduced, and use `frameloop={inView ? "always" : "never"}`. If a scene only changes on input,
   use `frameloop="demand"` and `invalidate()`.
3. **Skip it on weak devices.** Wrappers render the scene only when `useSceneTier()` is "lite" or "full" and pass
   `lite` down. "off" covers `prefers-reduced-motion`, no WebGL, `navigator.connection?.saveData`, and
   `navigator.deviceMemory <= 2`. Heavy scenes (scroll-driven, many meshes, shadows) are desktop-only (≥1024px),
   like `StagesGrowth`.
4. **Phone budget** (`matchMedia("(pointer: coarse)")` or width < 768):
   - `dpr={[1, 1.5]}`; on phones that are already sharp, skip antialiasing.
   - Under about 50 draw calls and 100k triangles. Anything repeated is one `instancedMesh` (we do this for leaves
     and branches) or drei `<Instances>`.
   - Textures at most 1024px. Photos go through `/_next/image?url=…&w=640&q=70` (the gallery uses `w=1080`; drop
     to 640 on phones). Models go through `npx gltfjsx model.glb --transform` (Draco, smaller textures, WebP).
   - No live shadows (use drei `<ContactShadows frames={1}>` or a baked texture), no postprocessing (bloom, depth
     of field), and at most ambient light plus one directional light.
   - About half the particles or instances that desktop gets.
5. **Adapt while running.** Wrap scenes in drei `<PerformanceMonitor onDecline={…}>` to lower dpr or counts when
   the frame rate drops. `<AdaptiveDpr pixelated />` and `<AdaptiveEvents />` help while dragging.
6. **Keep each frame cheap.** In `useFrame`, don't create objects: reuse `Vector3`/`Object3D` from `useMemo` or
   refs. Change refs and uniforms, never React state, every frame. Clamp `delta` (`Math.min(delta, 0.05)`) and
   ease with `THREE.MathUtils.damp`. Do heavy maths in shaders: `FieldBackdrop` moves about 7,700 points on the
   GPU.
7. **Touch must not get stuck.** A decorative canvas gets `pointer-events: none`. A draggable one gets
   `touch-pan-y` so the page still scrolls up and down (`PhotoRing`), plus a visible hint ("Drag to spin").
   Pointer parallax does nothing on touch, so the scene needs its own slow idle motion. Don't use the gyroscope:
   iPhones ask for permission.
8. **One WebGL context per scene.** Browsers allow about 16 at once. If one page needs several scenes, use drei
   `<View>` with one shared canvas (see the `pmndrs/react-three-next` starter).
9. **Scroll stays native on touch.** Link scenes to scroll with framer `useScroll` writing to a ref. On computers
   with a mouse or trackpad the public site uses Lenis (`SmoothScroll` in `(site)/layout.tsx`), which still moves the
   real scroll position, so sticky and `useScroll` keep working. Phones never get smooth-scroll. On phones the hero and the
   stages are pinned scroll sections, nothing else.

## The motion kit (use these, don't hand-roll)
All in `src/components/motion/`. Every piece stays still for reduced motion.
| Piece | What it does | Where it's used |
|---|---|---|
| `TextReveal` (+ `riseDelay`, `BrushUnderline`) | Headline words rise out of a mask one after another; lines after it rise with `gf-rise` + `riseDelay(ms)`; a gold stroke draws under a word. **CSS only**, so it works in server components and before scripts load (no hidden headline if JS is slow) | home hero, every `PublicPageHero` (plain-text titles) |
| `Reveal variant="up/fade/scale/left/right/mask"` | One block animates in when scrolled to. `mask` wipes a photo up from the bottom while it settles from a slight zoom | section headings (`SectionHeading`), photos, cards |
| `Stagger` + `StaggerItem` | Children come in one after another (`gap` seconds apart) | facts strip, pillars, admissions steps, photo tiles |
| `Parallax distance` | Moves content against the scroll so layers sit at different depths (half the distance on touch screens) | "Why Greenfield" photos |
| `ScrollMarquee` | Giant type in two lines sliding opposite ways with scroll (second line in outline) | home values band |
| `ExpandOnScroll` | A photo grows from a rounded card to edge-to-edge as it scrolls up, settling from a zoom; caption fades in | home values band |
| `ScrollHighlight` | A statement's words light up one after another as it scrolls (reading along) | home mission |
| `ToneBackdrop` + `data-tone` | The page background eases to each section's colour as its top passes two-thirds up the screen (`deep`, `cream`, `mist`, `warm`, `white`); those sections have no background of their own | home page |
| `SmoothScroll` | Lenis on mouse/trackpad, off on touch and for reduced motion; `data-lenis-prevent` for inner scroll areas | public layout |
| `PhoneActionBar` | Phones: "Apply" / "Book a visit" bar within thumb reach after the first screen, gone near the bottom and on /apply and /contact; sets `--gf-cta` so the WhatsApp button rises above it | public layout |
| `ScrollLine` | A gold line fills as its parent scrolls through the screen | admissions steps |
| `Tilt` | Card tilts towards the mouse with a moving highlight; a press on touch | "Life at Greenfield" tiles |
| `(site)/template.tsx` | Each public page eases in on arrival (`gf-page-in`) | all public pages |
| `CustomCursor` | Mouse only: gold dot + trailing ring; the ring grows over links and shows a word over `data-cursor="View"` / `"Drag"` / `"Scroll"` areas; the normal cursor returns over text fields | public layout; `Tilt` (View), photo ring (Drag), hero (Scroll) |
| `Magnetic` | The main calls to action lean towards the mouse and spring back | hero buttons, "Start an application" |
| `IntroCurtain` | First home page visit per browser session: the crest draws itself, the name rises, the curtain lifts (~1.9 s, CSS only); the hero's arrival waits for it | public layout (checks the address) |
| `gf-stagger` (CSS) | Children of a list or grid rise in one after another on page open; works in server components | portal lists and card grids, fees rows |
| Portal tab bar | The active highlight slides between tabs (framer `layoutId`), tabs press in on tap | `PortalShell` |
Plus `globals.css`: `gf-drift` / `gf-drift-slow` (glows behind page heroes), the header sliding away on scroll down
(`SiteHeader`, which sets `--gf-header` for sticky parts: use `top-[calc(var(--gf-header,72px)+8px)]`), and mobile
menu links cascading in with `transitionDelay`.

Choreography rules: one idea per section, things arrive in reading order (eyebrow → headline → text → buttons),
70–90ms between words, 90–150ms between cards, nothing longer than about 1.1s, and nothing waits for an animation
before it can be used.

Pitfalls:
- The browser counts a fully clipped element as off screen, so `whileInView` never fires on an element that starts
  at `clip-path: inset(100% …)`. `Reveal variant="mask"` watches an outer box and wipes an inner one: keep it that
  way.
- Framer writes `transform` inline, which beats CSS `active:scale-*` and `hover:-translate-*` on the same element.
  Put the CSS hover/press on a child, or use `whileTap` (as `Tilt` does).
- Don't put a `div` inside an `ol`/`ul` (e.g. `ScrollLine`): wrap the list instead.
- A `fixed` element inside a page's `template.tsx` wrapper is pinned to the page, not the screen, while the arrival
  animation runs (any `transform` does this). Full-screen overlays (the intro curtain, the cursor, the phone action
  bar) live in the layout, outside the template.
- The intro switch is a class on `<html>` set by an inline script before React starts, so `<html>` has
  `suppressHydrationWarning`. An inline `<script>` only runs on a full page load, never on client navigation, which
  is what we want.
- The phone layout of `StagesGrowth` pins the scene with `sticky`; its wrapper is `max-lg:contents` so the sticky
  element's parent is the whole column. A sticky element inside a box of its own height never sticks.

## Realism (how the nature scenes are built)
`three/nature.ts` holds the shared pieces. Reuse them before drawing new ones.
- **Textures are drawn on a canvas in the browser** (`leafTexture`, `barkTexture`, `petalTexture`), so there are no
  image files to download. Each is made once per page. Draw the leaf in pale greys with lighter veins, and tint
  each instance with `instanceColor`, so one texture gives every shade of green and gold. Use it as the `bumpMap`
  too, so the veins catch the light. If the base is near-white, light veins disappear: keep the base mid-grey.
- **Shape comes from the texture's transparency** (`alphaTest: 0.5`), not from the geometry. The card is bent
  instead: a small fold along the midrib, the tip curling back, a ruffled rim on petals. Keep the fold gentle
  (about 0.25): steeper folds put half the leaf in shadow and it reads as a half-moon.
- **Light like daylight**: hemisphere light (warm sky, green bounce), a warm key light, and a low light *behind*
  the subject, so leaves facing away glow through as they do against the sun (use `side: DoubleSide`). Add drei
  `<Environment frames={1}>` built from `<Lightformer>` panels for soft reflections. It renders once and downloads
  nothing (never use an `Environment preset`, which fetches an HDR file from a CDN).
- **Motion is physical**: falling leaves glide side to side, bank into the swing, sink fastest through the middle
  and drift with a breeze that rises and falls. Trees sway from the trunk base, leaves flutter on their stems, grass
  bends. Wood thickens as the tree ages (a sapling starts slender).
- **Tell the story with the camera**: start close on the small thing (the flower) and pull back as it grows
  (`CameraRig`). Put every step on one 0..1 timeline with named windows (`BLOOM`, `PETAL_FALL`, `WILT`, `TREE`,
  `CAMERA`) so the timing is easy to change.
- **Instances start at full size at the origin.** Hide them in a `useLayoutEffect` (scale 0) if the frame loop
  doesn't place every one of them on the first frame.
- Check realism close up: temporarily scale the objects up (e.g. leaves ×4) to see the detail, then put it back.

## Rules for UI motion (all screens)
- About 150–250ms for small things (press, toggle, menu) and 300–500ms for things entering the screen. Ease out
  when entering and ease in when leaving. Nothing makes the user wait for an animation to finish.
- Only animate movement (`transform`) and fading (`opacity`). Never animate size, margins or position on the page:
  it stutters on phones.
- Plain `transition` is fine (in Tailwind it only covers colours, opacity, shadow and transform). Never use
  `transition-all`. A progress bar or dot that grows names its property: `transition-[width]`.
- Phones have no hover. `tailwind.config.ts` has `future.hoverOnlyWhenSupported`, so `hover:` (and
  `group-hover:`) only applies with a mouse, and a tapped card no longer stays "hovered". So:
  - Every card that lifts on hover also gets a tap state: `hover:-translate-y-0.5 active:scale-[0.99]` (buttons have
    `active:translate-y-px`).
  - Never hide something until hover with a plain `opacity-0`. Touch screens would never show it. Use the
    `can-hover:` variant (mouse only): `can-hover:opacity-0 can-hover:group-hover:opacity-100` (photo captions on
    the home and gallery pages).
  - Tap targets are at least 36px, even when the thing drawn is smaller: put the small dot inside a bigger button
    (hero image dots).
  - Check that controls aren't covered on phones: `document.elementFromPoint` at the button's centre must return
    the button. The hero dots sat under the stats card at 375px, so they are now hidden below `sm`.
- Respect reduced motion everywhere: `motion-safe:` / `motion-reduce:` classes in Tailwind, `useReducedMotion` in
  scripts. Fading is fine; drop the movement.
- Loading: use skeletons (`PageSkeleton`, `SkeletonCard`) for content and a spinner only inside a button that is
  busy.
- Menus and drawers on phones open from the bottom (sheet) or side, and slide and fade at about 200ms.

## The repos to learn from (current best practice)
- **pmndrs/react-three-fiber**: the docs pages "Performance pitfalls" and "Scaling performance" are the checklist
  behind rules 2, 5 and 6.
- **pmndrs/drei**: ready-made helpers. Look here before writing your own: `PerformanceMonitor`, `AdaptiveDpr`,
  `Instances`, `View`, `ContactShadows`, `Image`, `useTexture`, `useGLTF` (Draco/Meshopt), `Float`,
  `MeshTransmissionMaterial` (desktop only).
- **pmndrs/gltfjsx**: turns a `.glb` into a typed component and compresses it (`--transform`).
- **pmndrs/react-three-next**: a Next.js starter with one shared canvas and `<View>` per section.
- **pmndrs/maath**: easing, damping and random-point helpers for `useFrame`.
- **pmndrs/postprocessing**: effects. Desktop only, and only if the scene still holds 60fps.
- **mrdoob/three.js** (`examples/` and the manual on threejs.org): manual pages "Rendering on demand",
  "Responsive design", "Optimize lots of objects".
- **utsuboco/r3f-perf**: an overlay with fps, draw calls and memory. Dev only; never ship it.
- **darkroomengineering/lenis**: in use (desktop only). **GSAP ScrollTrigger** and Codrops demos: good for ideas, but
  framer-motion already does our scroll-linked motion, so don't add GSAP as a second engine.

## Checking a scene
- Preview at 375px with Chrome DevTools (mobile device toolbar plus "4× CPU slowdown") and at desktop. Scroll
  through the scene: no stutter, no stuck scrolling, and the canvas stops when it leaves the screen (Performance
  panel).
- Turn on "Emulate prefers-reduced-motion: reduce" and check that the fallback looks finished, not empty.
- Add `<Perf />` from r3f-perf temporarily: under about 50 calls, and steady fps under throttling. Remove it after.
- `npx next build`: three.js must not show up in the first-load JS of any page (it should be a dynamic chunk).

## Pitfalls we hit
- Each `useWebGLAvailable` call used to open a new WebGL context and never close it, so a page with several scenes
  could reach the browser's limit. Check once per page load (`detectWebGL`) and release the test context.
- With `hoverOnlyWhenSupported` on, a caption written `opacity-0 group-hover:opacity-100` disappears on phones for
  good. Use `can-hover:` for the hidden state.
- To draw fewer instances without rebuilding the mesh, set `instancedMesh.count`.
- On touch screens R3F's `pointer` is wherever the finger is while scrolling, so pointer parallax drags the subject
  off centre: only follow the pointer when `(pointer: fine)` (see `CameraRig`).
- Phone hero: the bud sits above the headline, then `frame.yBloom` brings the open flower to the middle once the text
  has faded.
- Pinned 3D scenes on tall phone screens: work out the camera distance from the canvas aspect (`size` in
  `useFrame`), or the crown/flower is cut off at the sides.
- Parts of a scene that can't change yet (the tree before the sapling appears) should skip their per-frame work once
  drawn hidden (`settled` in `Tree`).
