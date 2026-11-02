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
- **Scenes** in `src/components/three/`. Each has a light wrapper (`hero-leaves.tsx`) and a heavy scene
  (`hero-leaves-scene.tsx`) loaded with `next/dynamic(..., { ssr: false })`, so three.js is only downloaded in the
  browser, after the page shows.

  | Scene | Where | Phones |
  |---|---|---|
  | `HeroLeaves`: instanced falling leaves, pointer parallax | home hero | lite: 35 of 70 leaves, dpr 1.25, no antialias; `PerformanceMonitor` drops to dpr 1 and fewer leaves |
  | `StagesGrowth` / `growing-tree-scene`: tree grows with scroll (framer `useScroll` → ref) | home "three stages" | cards only (3D needs "full" and ≥1024px) |
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
9. **Scroll stays native.** Link scenes to scroll with framer `useScroll` writing to a ref. Don't hijack scrolling
   (no smooth-scroll libraries on touch), and don't pin sections on phones.

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
- **darkroomengineering/lenis**, **GSAP ScrollTrigger**, Codrops demos: good for ideas. Check them against rule 9
  before copying.

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
- To draw fewer instances without rebuilding the mesh, set `instancedMesh.count` (what `HeroLeaves` does when the
  frame rate drops).
