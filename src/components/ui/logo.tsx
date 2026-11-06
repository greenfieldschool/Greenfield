import { useId } from "react";
import { cn } from "@/lib/cn";

// The Greenfield crest, redrawn from the school's certificate artwork (issues/logo-extract.jpg):
// a white shield with a gold, green and gold edge; the school name; the motto "Excellence in Character & Academics"
// on a dark green band; an oak on a green hill in front of a rising sun; and the "Knowledge is Light" ribbon (white,
// green edge, gold outline, gold folds) with two gold stars.
//
// Versions of the same drawing:
// - `Crest`     the full crest with all its words. For large use only (≥ ~80px tall): certificates, report cards.
// - `LogoMark`  the shield without words or ribbon, for nav bars, buttons and the browser/app icon.
// - `detail="merch"` the full crest simplified for small embroidery and print (caps, polo chests from 60mm): no
//               motto words (the band stays as a plain bar), bigger name and ribbon words, fewer and bolder sun rays,
//               heavier edges. Same silhouette, so it is recognisably the same crest.
// - `tone="mono"`    dark green only, for rubber stamps, engraving, one-colour screen print and photocopies.
// - `tone="reverse"` white and gold on the school green, for dark fabric (polos, caps, bags) and dark signs.
// Line weights are sized for embroidery: nothing is thinner than ~1mm when the full crest is 75mm wide (see
// docs/brand.md for minimum sizes and colour codes). Print files: /brand/<name>.svg (app/brand/[file]/route.ts).
// All share the shapes below, so they always match. Plain SVG (no clip paths or gradients), so many can sit on one
// page and next/og's ImageResponse can draw them (app-icon-art.tsx).

export type CrestTone = "color" | "mono" | "reverse";
export type CrestDetail = "full" | "merch";
// Where the tree sits in each version.
export const CREST_TREE_Y: Record<CrestDetail, number> = { full: 130, merch: 133 };

export const CREST = {
  // The words on the crest. "SCHOOL" is the whole school's crest (site, logins, icons). Each section can carry its own
  // second word (SECTION_WORD below), used where we know the pupil's section: report cards and certificates.
  name: ["GREENFIELD", "SCHOOL"],
  motto: "Excellence in Character & Academics",
  ribbon: "KNOWLEDGE IS LIGHT"
} as const;

// Sections match the database's `school_level` enum (classes.level).
export type SchoolSection = "creche" | "primary" | "secondary";
// The second word on each section's crest. Secondary pupils are "Greenfield College" (as on the school's original
// certificate artwork); creche and primary stay "Greenfield School". Change a section's word here and its crests,
// report cards and certificates follow.
export const SECTION_WORD: Record<SchoolSection, string> = { creche: "SCHOOL", primary: "SCHOOL", secondary: "COLLEGE" };

const isSection = (v: unknown): v is SchoolSection => v === "creche" || v === "primary" || v === "secondary";
/** The crest's second word for a section; the whole-school word when the section is unknown. */
export function crestWord(section?: string | null) {
  return isSection(section) ? SECTION_WORD[section] : CREST.name[1];
}
/** "Greenfield School" / "Greenfield College", for headings next to the crest. */
export function schoolName(section?: string | null) {
  const w = crestWord(section);
  return `Greenfield ${w.charAt(0)}${w.slice(1).toLowerCase()}`;
}

// `ink` is the main drawing colour (green on white; white on the dark-fabric version), `paper` the field behind it,
// `bandText` the motto words on the band.
type Palette = { ink: string; gold: string; goldDeep: string; goldLight: string; sun: string; paper: string; bandText: string };
const GREEN = "#0B3D2E";
const PALETTE: Record<CrestTone, Palette> = {
  color: { ink: GREEN, gold: "#C9961A", goldDeep: "#8A6511", goldLight: "#EDC54C", sun: "#F7E9BC", paper: "#FFFFFF", bandText: "#FFFFFF" },
  mono: { ink: GREEN, gold: GREEN, goldDeep: GREEN, goldLight: "#FFFFFF", sun: "#FFFFFF", paper: "#FFFFFF", bandText: "#FFFFFF" },
  reverse: { ink: "#FFFFFF", gold: "#D4A72C", goldDeep: "#A97E14", goldLight: GREEN, sun: GREEN, paper: GREEN, bandText: GREEN }
};

// Fonts: the app uses the site's loaded fonts; standalone files (print, merch) name the fonts directly.
export type CrestFonts = "app" | "file";
const FONTS: Record<CrestFonts, { serif: string; sans: string }> = {
  app: {
    serif: "var(--font-display), Georgia, 'Times New Roman', serif",
    sans: "var(--font-sans), 'Helvetica Neue', Arial, sans-serif"
  },
  file: { serif: "Fraunces, Georgia, 'Times New Roman', serif", sans: "'Plus Jakarta Sans', 'Helvetica Neue', Arial, sans-serif" }
};

export const CREST_VIEWBOX = "0 0 200 224";
export const CREST_RATIO = 224 / 200;
// The small mark has no ribbon or stars, so it is cropped to the shield.
export const MARK_VIEWBOX = "18 0 164 222";
export const MARK_TREE_Y = 122;

// Heater shield with an arched top that rises to a point in the middle.
export const SHIELD = "M28 22Q66 27 100 8Q134 27 172 22V108C172 158 144 190 100 212C56 190 28 158 28 108Z";
const RIBBON = "M28 166Q100 186 172 166L172 189Q100 209 28 189Z";
const RIBBON_TEXT_PATH = "M30 182Q100 202 170 182";
const TAIL_LEFT = "M38 172L5 175L15 186L5 197L38 195Z";
const TAIL_RIGHT = "M162 172L195 175L185 186L195 197L162 195Z";
const FOLD_LEFT = "M28 189L38 195L38 186Z";
const FOLD_RIGHT = "M172 189L162 195L162 186Z";

const f = (n: number) => n.toFixed(2);

function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${f(cx + rad * Math.cos(a))},${f(cy + rad * Math.sin(a))}`);
  }
  return pts.join(" ");
}

// Tapered sun rays: thin wedges that stay solid when printed small or photocopied (hairlines break up).
// `step` is the angle between rays and `half` the half-width of each wedge at its outer end, in degrees.
function rays(cx: number, cy: number, inner: number, outer: number, step = 15, half = 3.2) {
  const out: string[] = [];
  for (let deg = -180 + step; deg <= -step + 0.01; deg += step) {
    const a = (deg * Math.PI) / 180;
    const w = (half * Math.PI) / 180;
    const p = (r: number, ang: number) => `${f(cx + r * Math.cos(ang))} ${f(cy + r * Math.sin(ang))}`;
    out.push(`M${p(inner, a)}L${p(outer, a - w)}L${p(outer, a + w)}Z`);
  }
  return out.join("");
}

// Oak canopy: one scalloped silhouette (lobes drawn as arcs around the outline), centred on (100, ty).
function canopy(ty: number) {
  const pts: Array<[number, number, number]> = [
    // [dx, dy, arc radius to reach this point]
    [-30, 2, 9],
    [-21, -12, 9],
    [-9, -20, 8.5],
    [9, -20, 10],
    [21, -12, 8.5],
    [30, 2, 9],
    [26, 16, 8],
    [12, 20, 8],
    [0, 19, 7],
    [-12, 20, 7],
    [-26, 16, 8]
  ];
  let d = `M${f(100 - 26)} ${f(ty + 16)}`;
  for (const [dx, dy, r] of pts) d += `A${r} ${r} 0 0 1 ${f(100 + dx)} ${f(ty + dy)}`;
  return d + "Z";
}

// Trunk with two branches into the canopy and a root flare.
function trunk(ty: number) {
  const y = (n: number) => f(ty + n);
  return (
    `M95 ${y(36)}C96.5 ${y(29)} 97 ${y(23)} 96 ${y(17)}L89 ${y(10)}L91.5 ${y(8.5)}L98.5 ${y(14)}L100 ${y(6)}` +
    `L101.5 ${y(14)}L108.5 ${y(8.5)}L111 ${y(10)}L104 ${y(17)}C103 ${y(23)} 103.5 ${y(29)} 105 ${y(36)}` +
    `C108 ${y(36.5)} 111 ${y(37.5)} 113 ${y(39)}H87C89 ${y(37.5)} 92 ${y(36.5)} 95 ${y(36)}Z`
  );
}

// The shapes shared by every version. Called as a function (not a component), and grouped with <g> rather than
// fragments, so next/og can render it inside <svg>.
// `treeY` places the tree; `ribbonId` must be unique on the page (the ribbon words follow a curve referred to by id).
export function crestShapes({
  words,
  treeY,
  ribbonId = "gf-crest-ribbon",
  tone = "color",
  fonts = "app",
  detail = "full",
  section
}: {
  words: boolean;
  treeY: number;
  ribbonId?: string;
  tone?: CrestTone;
  fonts?: CrestFonts;
  detail?: CrestDetail;
  /** creche / primary / secondary: picks the second word (SECTION_WORD). Leave out for the whole-school crest. */
  section?: string | null;
}) {
  const word = crestWord(section);
  // The second word keeps the same letter spacing whatever its length ("SCHOOL" = 52 units wide on the full crest),
  // and the gold rules and diamonds beside it move out to make room.
  const wordW = word.length * (52 / 6);
  const half = wordW / 2;
  const dl = 100 - half - 10; // centre of the left diamond (64 for "SCHOOL")
  const dr = 100 + half + 10;
  const c = PALETTE[tone];
  const ty = treeY; // centre of the canopy
  const merch = words && detail === "merch";
  const s = !words ? 1.3 : merch ? 1 : 0.9; // the small mark has room for a bigger tree
  const edge = merch ? { gold: 17, ink: 10, ribbonGold: 9, ribbonInk: 4.2 } : { gold: 15, ink: 9, ribbonGold: 7.5, ribbonInk: 3.4 };
  const serif = { fontFamily: FONTS[fonts].serif };
  const sans = { fontFamily: FONTS[fonts].sans };
  return (
    <g>
      {/* Shield: gold outer edge, dark green rim, thin gold inner line, white field. `data-part` names each piece so
          CSS can animate it (.gf-crest-anim in globals.css); it changes nothing in the drawing. */}
      <path data-part="field" d={SHIELD} fill={c.paper} stroke="none" />
      <path data-part="edge" d={SHIELD} pathLength={1} fill="none" stroke={c.gold} strokeWidth={edge.gold} strokeLinejoin="round" />
      <path data-part="edge" d={SHIELD} pathLength={1} fill="none" stroke={c.ink} strokeWidth={edge.ink} strokeLinejoin="round" />

      {merch ? (
        <g data-part="words">
          <text x={100} y={56} textAnchor="middle" fill={c.ink} fontSize={23} fontWeight={700} textLength={122} lengthAdjust="spacingAndGlyphs" style={serif}>
            {CREST.name[0]}
          </text>
          <text x={100} y={80} textAnchor="middle" fill={c.ink} fontSize={16} fontWeight={700} textLength={f(word.length * (68 / 6))} lengthAdjust="spacing" style={serif}>
            {word}
          </text>
          {/* The motto band without its words: too small to stitch, but the bar keeps the crest's shape. */}
          <rect x={32} y={89} width={136} height={12} fill={c.ink} />
        </g>
      ) : words ? (
        <g data-part="words">
          <text x={100} y={50} textAnchor="middle" fill={c.ink} fontSize={19.5} fontWeight={700} textLength={116} lengthAdjust="spacingAndGlyphs" style={serif}>
            {CREST.name[0]}
          </text>
          {/* Second line between gold rules and diamonds, like the certificate's ornaments. */}
          <path d={`M44 68.5H${f(dl - 5)}M${f(dr + 5)} 68.5H156`} stroke={c.gold} strokeWidth={1.8} strokeLinecap="round" />
          <path d={`M${f(dl - 3)} 68.5l3-3 3 3-3 3ZM${f(dr - 3)} 68.5l3-3 3 3-3 3Z`} fill={c.gold} />
          <text x={100} y={73} textAnchor="middle" fill={c.ink} fontSize={12.5} fontWeight={700} textLength={f(wordW)} lengthAdjust="spacing" style={serif}>
            {word}
          </text>
          {/* Motto band: dark green with gold rules (the school asked for the dark green background). */}
          <rect x={32} y={83} width={136} height={19} fill={c.ink} />
          <path d="M32 84.2H168M32 100.8H168" stroke={c.goldLight} strokeWidth={1.6} />
          <text x={100} y={95.6} textAnchor="middle" fill={c.bandText} fontSize={8} fontWeight={600} textLength={124} lengthAdjust="spacingAndGlyphs" style={sans}>
            {CREST.motto}
          </text>
        </g>
      ) : (
        <g data-part="band">
          {/* Without words the band stays as a plain dark green bar near the top. */}
          <rect x={32} y={34} width={136} height={20} fill={c.ink} />
          <path d="M32 35H168M32 53H168" stroke={c.goldLight} strokeWidth={1.8} />
        </g>
      )}

      {/* Rising sun, oak and hill, scaled around the centre of the canopy. */}
      <g transform={`translate(${f(100 * (1 - s))} ${f(ty * (1 - s))}) scale(${s})`}>
        {/* Soft sun disc on the horizon, then tapered rays. */}
        <path data-part="sun" d={`M60 ${f(ty + 38)}A40 40 0 0 1 140 ${f(ty + 38)}Z`} fill={c.sun} stroke={tone === "color" ? "none" : c.ink} strokeWidth={2} />
        <path data-part="rays" d={merch ? rays(100, ty + 38, 45, 58, 22.5, 5.5) : rays(100, ty + 38, 45, 57)} fill={c.gold} />
        {/* Oak. */}
        <g data-part="tree">
          <path d={canopy(ty)} fill={c.ink} />
          <path d={trunk(ty)} fill={c.ink} />
        </g>
        {/* Hill. */}
        <path data-part="hill" d={`M62 ${f(ty + 41)}Q100 ${f(ty + 31)} 138 ${f(ty + 41)}Z`} fill={c.ink} />
      </g>

      {/* Ribbon (full crest only; at icon sizes it is clutter): tails and gold folds behind, then the band. */}
      {words ? (
        <g data-part="ribbon" strokeLinejoin="round">
          <path d={TAIL_LEFT} fill={c.paper} stroke={c.gold} strokeWidth={merch ? 7 : 6} />
          <path d={TAIL_RIGHT} fill={c.paper} stroke={c.gold} strokeWidth={merch ? 7 : 6} />
          <path d={TAIL_LEFT} fill={c.paper} stroke={c.ink} strokeWidth={merch ? 3.6 : 2.8} />
          <path d={TAIL_RIGHT} fill={c.paper} stroke={c.ink} strokeWidth={merch ? 3.6 : 2.8} />
          <path d={FOLD_LEFT} fill={c.goldDeep} />
          <path d={FOLD_RIGHT} fill={c.goldDeep} />
          <path d={RIBBON} fill={c.paper} stroke={c.gold} strokeWidth={edge.ribbonGold} />
          <path d={RIBBON} fill={c.paper} stroke={c.ink} strokeWidth={edge.ribbonInk} />
        </g>
      ) : null}
      {words ? (
        <g>
          <path id={ribbonId} d={RIBBON_TEXT_PATH} fill="none" />
          {/* The curve is 142 units long and the ribbon's clear middle about 124, so the words are held to 124: spaced out
              on the full crest, squeezed under 10% on the merch crest so its letters can be bigger. */}
          <text
            data-part="ribbon-words"
            fill={c.ink}
            textAnchor="middle"
            fontSize={merch ? 12.5 : 10.5}
            fontWeight={800}
            letterSpacing={merch ? 0 : 0.8}
            textLength={124}
            lengthAdjust={merch ? "spacingAndGlyphs" : "spacing"}
            style={sans}
          >
            <textPath href={`#${ribbonId}`} startOffset="50%">
              {CREST.ribbon}
            </textPath>
          </text>
          <polygon data-part="star" points={star(18, 210, merch ? 8 : 6.5)} fill={c.gold} />
          <polygon data-part="star" points={star(182, 210, merch ? 8 : 6.5)} fill={c.gold} />
        </g>
      ) : null}
    </g>
  );
}

// The full crest with all its words.
export function Crest({
  className,
  title = "Greenfield crest",
  tone = "color",
  detail = "full",
  section
}: {
  className?: string;
  title?: string;
  tone?: CrestTone;
  detail?: CrestDetail;
  /** The pupil's section (classes.level); leave out for the whole-school crest. */
  section?: string | null;
}) {
  const ribbonId = `gf-ribbon-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox={CREST_VIEWBOX} className={className ?? "h-28 w-[100px]"} role="img" aria-label={title}>
      {crestShapes({ words: true, treeY: CREST_TREE_Y[detail], ribbonId, tone, detail, section })}
    </svg>
  );
}

// The crest without words or ribbon, for small sizes. `inverted` is kept for older callers: the white shield with its
// gold edge reads on both light and dark green backgrounds, so it draws the same either way.
export function LogoMark({ className, tone = "color" }: { className?: string; inverted?: boolean; tone?: CrestTone }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={className ?? "h-10 w-9"} aria-hidden="true">
      {crestShapes({ words: false, treeY: MARK_TREE_Y, tone })}
    </svg>
  );
}

export function Logo({
  className,
  inverted,
  subtitle = "School"
}: {
  className?: string;
  inverted?: boolean;
  subtitle?: string;
}) {
  return (
    <span className={cn("gf-logo-hover inline-flex items-center gap-2.5", className)}>
      <LogoMark className="h-10 w-9 shrink-0" />
      <span className="leading-none">
        <span className={cn("block font-display text-[1.15rem] font-semibold", inverted ? "text-white" : "text-brand-green")}>
          Greenfield
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[0.62rem] font-semibold uppercase tracking-[0.22em]",
            inverted ? "text-brand-gold-300" : "text-brand-gold-700"
          )}
        >
          {subtitle}
        </span>
      </span>
    </span>
  );
}

// Login screens: the full crest assembling itself (.gf-crest-anim), with the area's name under it ("Staff dashboard",
// "Parent & student portal"). The animation plays once as the page opens and never delays the form.
export function CrestLockup({
  subtitle,
  inverted,
  align = "center",
  size = "md",
  animate = true
}: {
  subtitle: string;
  inverted?: boolean;
  align?: "center" | "start";
  size?: "sm" | "md";
  animate?: boolean;
}) {
  return (
    <div className={cn("flex flex-col gap-3", align === "center" ? "items-center text-center" : "items-start")}>
      <Crest
        className={cn(
          size === "md" ? "h-32 w-[114px] sm:h-36 sm:w-32" : "h-24 w-[86px]",
          inverted && "drop-shadow-[0_12px_28px_rgba(0,0,0,0.35)]",
          animate && "gf-crest-anim"
        )}
        title="Greenfield crest"
      />
      <span
        className={cn(
          "text-[0.68rem] font-semibold uppercase tracking-[0.24em]",
          inverted ? "text-brand-gold-300" : "text-brand-gold-700",
          animate && "animate-fade-up [animation-delay:1s]"
        )}
      >
        {subtitle}
      </span>
    </div>
  );
}
