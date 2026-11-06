---
name: brand-logo
description: Use when changing the school crest/logo, its words or colours, the browser tab icon, the home-screen app icons, or where the crest appears (headers, certificates, report cards).
---

# Brand and logo (the Greenfield crest)

## When to use
Anything about the crest itself or the icons made from it. For the layout of the page it sits on, also use
ui-ux-design; for certificate/report card content, results-and-reports.

## Where things live
- `src/components/ui/logo.tsx`: the one drawing of the crest, as plain SVG.
  - `CREST`: colours and the words on the crest (`name`, `motto`, `ribbon`). Change the words here only.
  - Section crests: `SECTION_WORD` gives each section (`creche` / `primary` / `secondary`, the `school_level` enum on
    `classes.level`) its second word: secondary = COLLEGE, creche and primary = SCHOOL. `crestWord(section)` and
    `schoolName(section)` ("Greenfield College") read it; pass `section` to `Crest` / `crestShapes`. No section =
    the whole-school crest ("SCHOOL").
  - `crestShapes({ words, treeY, ribbonId })`: the shapes, shared by every version.
  - `Crest`: full crest with the name, motto band and "Knowledge is Light" ribbon. For large use only (≥ ~80px
    tall): certificates (`components/certificate.tsx`), report cards (`components/report-card.tsx`).
  - `LogoMark`: the shield without words or ribbon, cropped to `MARK_VIEWBOX`. For nav bars, buttons, small spots.
  - `Logo`: `LogoMark` + "Greenfield" + subtitle, used in every header and login screen.
  - `detail="merch"` (on `Crest` / `crestShapes`): the full crest simplified for small embroidery (from 60mm): no
    motto words, bigger name and ribbon words, 7 bold rays, heavier edges. Smallest sizes: full → merch → mark.
  - `tone`: `"color"` (default), `"mono"` (dark green only: stamps, engraving, one-colour print), `"reverse"` (white
    and gold on the school green: dark fabric). `fonts: "file"` names Fraunces / Plus Jakarta Sans directly for
    standalone files (CSS variables don't exist outside the site).
- `src/lib/crest-svg.ts` + `src/app/brand/[file]/route.ts`: print files at `/brand/<name>.svg` (list in
  `CREST_FILES`), made by a small JSX→SVG serializer over `crestShapes`. `docs/brand.md`: the brand sheet for
  printers (colour codes, smallest sizes, placement, don'ts). Keep it in step with `CREST_FILES`.
- `src/components/app-icon-art.tsx` (`IconArt`): browser tab icon (`app/icon.tsx`), Apple icon (`app/apple-icon.tsx`)
  and home-screen icons (`app/app-icon/[size]`), drawn with next/og from the same `crestShapes`.
- Source artwork from the school: `issues/logo-extract.jpg` (certificate with the crest and their notes).
- Dev-only preview of every size, the icons and a sample certificate: `/design-preview/logo`.

## Which version goes where (keep to this)
| Place | Version | Motion |
|---|---|---|
| Home page intro, first visit per session (`motion/intro-curtain.tsx`) | `Crest`, large, on deep green | `gf-crest-anim`: the crest assembles itself (~1.4s), curtain lifts at 1.75s |
| Staff, portal and conductor logins (`admin/login/ui.tsx`, `portal/_components/portal-ui.tsx` `LoginFrame`, `conductor/login/ui.tsx`) | `CrestLockup` (crest + area name) | `gf-crest-anim` on each visit; never delays the form |
| Site header, menu drawer, portal nav, other small headers | `Logo` (`LogoMark` + "Greenfield" + subtitle) | `gf-logo-hover`: sun rays turn a little on hover/focus |
| Admin sidebar (`AdminShell`) | `LogoMark` + text | `gf-logo-hover` |
| Site footer (`site-footer.tsx`) | `Crest` (static) beside "Greenfield / School · Lekki, Lagos" | none |
| Certificates, report cards | `Crest section={report.cls.level}` (static, prints) + `schoolName(level)` heading | none: printed pages never animate |
| Loading screens: public site and staff dashboard (`motion/crest-loader.tsx`, `(site)/loading.tsx`, `admin/loading.tsx`) | `LogoMark` shapes + a gold `SHIELD` sweep path, bar and "Loading…" | `.gf-crest-loader`: light runs round the edge, rays breathe, bar slides; loops, fades in after 250ms |
| Browser tab, home-screen icons (`app-icon-art.tsx`) | `LogoMark` shapes on green | none |
| Link previews (`app/opengraph-image.tsx`, needs `metadataBase` in `app/layout.tsx`) | `LogoMark` shapes + name | none |
| Emails (`lib/email/templates.ts` header) | `/app-icon/192` PNG (Gmail can't show SVG) | none |
| Merchandise, print | files from `/brand/*.svg`, see `docs/brand.md` | — |

## Animation
- `.gf-crest-anim` in `globals.css` animates the parts tagged `data-part` in `crestShapes` (edge, field, words, band,
  sun, rays, hill, tree, ribbon, ribbon-words, star). Transform and opacity only (plus the edge's stroke dash), inside
  `prefers-reduced-motion: no-preference`, so reduced motion shows the finished crest at once. `--cd` shifts the start.
- Keep `data-part` names stable; they are the animation's hooks. Elements with a `transform` attribute can't take a
  CSS transform, so put `data-part` on a child (the tree is wrapped in its own `<g>` inside the scaled group).
- One big crest animation per screen at most; small marks only get the hover touch.
- The loader only shows mid-navigation; check it at `/design-preview/logo#loader`.
- Testing in the built-in browser: when the pane is hidden the page's animation clock stops at 0 and everything
  looks invisible. Run `document.getAnimations().forEach(a => a.finish())` to see the end state, or show the pane.

## Rules
- One drawing. Never paste a second copy of the crest paths into another file; import from `logo.tsx`.
- The school's wishes on the crest (Nov 2026): the motto band "Excellence in Character & Academics" is dark green
  with white words; the "Knowledge is Light" ribbon is white with a green edge and a gold outline outside it (no
  dark green fill).
- Design for merchandise, not just screens: nothing thinner than ~1.5 units (≈1mm stitched at 75mm wide), flat spot
  colours only (no gradients, shadows or transparency), at most 3 colours (green, gold, white), and every new
  element must also work in `mono` and `reverse`. Hairlines and tiny words vanish in embroidery.
- `crestShapes` may only use plain SVG elements with string/number props, so the serializer in `crest-svg.ts` can
  write it out; if you add a new camelCase SVG attribute, add it to `DASHED` there.
- Words that must fit use `textLength` + `lengthAdjust="spacingAndGlyphs"`, so they never run into the shield edge
  whatever font loads.
- Size the crest by passing `className` with both height and width. The default size is used only when no
  `className` is given, because `cn` is plain `clsx` (no tailwind-merge), so `h-10` and `h-40` together fight.

## Pitfalls we hit
- next/og (satori) can't draw React fragments inside `<svg>` ("Cannot convert a Symbol value to a string"), and
  it can't render components inside SVG either. `crestShapes` is called as a function and groups with `<g>`.
- `textPath` needs `href="#id"`; Chrome ignores the SVG2 `path` attribute. `Crest` makes the id unique with
  `useId()` so several crests can share a page. No clip paths, so no other ids are needed.
- The small mark with the ribbon was too busy at 36px; it has no ribbon and a 1.45× tree instead.

- The first redraw built the tree from overlapping circles (read as clip-art) and the sun from hairline rays (broke
  up when small). The oak is now one scalloped path and the rays are tapered wedges.
- The ribbon curve is 142 units long and the words overflowed it (and were cut off) at 13px. Ribbon words are held to
  `textLength={124}` (`spacing` on the full crest, `spacingAndGlyphs` ≤10% squeeze on merch). Measure with
  `getComputedTextLength()` in the preview after any change to the ribbon text.
- The second name line ran into its gold ornaments when letter-spaced: it uses `textLength` to stay between them.
- The whole-school crest says "GREENFIELD SCHOOL", not "College" as on the school's old certificate: Greenfield runs
  from creche to secondary, and not every pupil is in the college (decided Nov 2026). Each section's own crest uses
  `SECTION_WORD` (secondary = COLLEGE). Use the section crest only where the pupil's section is known (report cards,
  certificates, secondary merch); headers, logins, icons and the site stay on the whole-school crest.
- The second word keeps "SCHOOL"'s letter spacing (52/6 units a letter on the full crest, 68/6 on merch) and the
  gold rules and diamonds move out to fit. A word longer than ~9 letters will hit the shield edge: shorten it.

## Verify
- `npx tsc --noEmit -p .`, `npx next lint --dir src`.
- Dev server, open `/design-preview/logo`; check `/icon`, `/apple-icon`, `/app-icon/512`, `/app-icon/512-maskable`
  return 200 and look right (the icon routes fail with a 500 if satori can't draw something).
- Open `/brand/greenfield-crest.svg`, `/brand/greenfield-crest-dark.svg` and `/brand/greenfield-college-crest.svg` directly: they must draw on their own
  (ribbon words on the curve, transparent background).
