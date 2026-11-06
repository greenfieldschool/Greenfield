import { useId } from "react";
// Snapshot of the crest before the Nov 2026 redraw, for side-by-side comparison on /design-preview/logo only.
import { cn } from "@/lib/cn";

// The Greenfield crest, redrawn from the school's certificate artwork (issues/logo-extract.jpg):
// a white shield with a dark green and gold edge, the school name, the motto "Excellence in Character & Academics"
// on a dark green band, an oak tree in front of a rising sun, and the "Knowledge is Light" ribbon (white, green edge,
// gold outline) with gold stars.
//
// Two sizes of the same drawing:
// - `Crest`     the full crest with all its words. Use it where it is shown large: certificates, report cards,
//               login screens. Don't use it below ~80px tall; the words can't be read.
// - `LogoMark`  the same shield without words, for nav bars, buttons and the browser/app icon.
// Both share the shapes below, so they always match. Plain SVG (no clip paths or ids), so many can sit on one page
// and next/og's ImageResponse can draw them (app-icon-art.tsx).

export const CREST = {
  green: "#0B3D2E",
  greenDeep: "#072A1F",
  gold: "#C9961A",
  goldLight: "#EDC54C",
  paper: "#FFFFFF",
  // The words on the crest. The school's artwork says "College"; change it here and every crest follows.
  name: ["GREENFIELD", "COLLEGE"],
  motto: "Excellence in Character & Academics",
  ribbon: "KNOWLEDGE IS LIGHT"
} as const;

export const CREST_VIEWBOX = "0 0 200 224";
export const CREST_RATIO = 224 / 200;
// The small mark has no ribbon or stars, so it is cropped to the shield.
export const MARK_VIEWBOX = "18 0 164 222";
export const MARK_TREE_Y = 118;

const SHIELD = "M28 26C60 24 84 18 100 9c16 9 40 15 72 17v82c0 50-28 82-72 104C56 190 28 158 28 108Z";
const RIBBON = "M28 166Q100 186 172 166L172 189Q100 209 28 189Z";
const RIBBON_TEXT_PATH = "M30 182Q100 202 170 182";
const TAIL_LEFT = "M36 173L5 175L14 186L5 197L36 195Z";
const TAIL_RIGHT = "M164 173L195 175L186 186L195 197L164 195Z";
const FOLD_LEFT = "M28 189L36 195L36 189Z";
const FOLD_RIGHT = "M172 189L164 195L164 189Z";

function star(cx: number, cy: number, r: number) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

// Sun rays behind the tree ("Knowledge is light").
function rays(cx: number, cy: number, inner: number, outer: number) {
  const out: string[] = [];
  for (let deg = -168; deg <= -12; deg += 13) {
    const a = (deg * Math.PI) / 180;
    out.push(
      `M${(cx + inner * Math.cos(a)).toFixed(1)} ${(cy + inner * Math.sin(a)).toFixed(1)}L${(cx + outer * Math.cos(a)).toFixed(1)} ${(cy + outer * Math.sin(a)).toFixed(1)}`
    );
  }
  return out.join("");
}

// The shapes shared by both sizes. Called as a function (not a component) so next/og can render it inside <svg>.
// `treeY` moves the tree: the full crest leaves room for the name; the mark centres it in the shield.
// `ribbonId` must be unique on the page (the ribbon words follow a curve that the text refers to by id).
export function crestShapes({
  words,
  treeY,
  ribbonId = "gf-crest-ribbon"
}: {
  words: boolean;
  treeY: number;
  ribbonId?: string;
}) {
  const c = CREST;
  const ty = treeY; // centre of the canopy
  const treeScale = words ? 1 : 1.45;
  return (
    <g>
      {/* Shield: gold outer edge, dark green rim, thin gold inner line, white field. */}
      <path d={SHIELD} fill={c.paper} stroke={c.gold} strokeWidth={15} strokeLinejoin="round" />
      <path d={SHIELD} fill="none" stroke={c.green} strokeWidth={9} strokeLinejoin="round" />

      {words ? (
        <g>
          <text
            x={100}
            y={54}
            textAnchor="middle"
            fill={c.green}
            fontSize={19}
            fontWeight={700}
            textLength={112}
            lengthAdjust="spacingAndGlyphs"
            style={{
              fontFamily: "var(--font-display), Georgia, 'Times New Roman', serif"
            }}
          >
            {c.name[0]}
          </text>
          <text
            x={100}
            y={75}
            textAnchor="middle"
            fill={c.green}
            fontSize={15.5}
            fontWeight={700}
            letterSpacing={3}
            style={{
              fontFamily: "var(--font-display), Georgia, 'Times New Roman', serif"
            }}
          >
            {c.name[1]}
          </text>
          {/* Motto band: dark green with gold rules. */}
          <rect x={32} y={84} width={136} height={19} fill={c.green} />
          <path d="M32 84.8H168M32 102.2H168" stroke={c.goldLight} strokeWidth={1.1} />
          <text
            x={100}
            y={96.6}
            textAnchor="middle"
            fill="#FFFFFF"
            fontSize={8}
            fontWeight={600}
            textLength={126}
            lengthAdjust="spacingAndGlyphs"
            style={{
              fontFamily: "var(--font-sans), 'Helvetica Neue', Arial, sans-serif"
            }}
          >
            {c.motto}
          </text>
        </g>
      ) : (
        <g>
          {/* Without words the band stays as a plain dark green bar near the top. */}
          <rect x={32} y={34} width={136} height={20} fill={c.green} />
          <path d="M32 35H168M32 53H168" stroke={c.goldLight} strokeWidth={1.8} />
        </g>
      )}

      {/* Rising sun, tree and ground; drawn larger on the small mark. */}
      <g
        transform={`translate(${(100 * (1 - treeScale)).toFixed(2)} ${(ty * (1 - treeScale)).toFixed(2)}) scale(${treeScale})`}
      >
        {/* Rising sun behind the tree. */}
        <path
          d={rays(100, ty + 6, 24, words ? 33 : 35)}
          stroke={c.gold}
          strokeWidth={words ? 2 : 2.6}
          strokeLinecap="round"
        />

        {/* Oak tree. */}
        <g fill={c.green}>
          <circle cx={100} cy={ty - 2} r={16} />
          <circle cx={86} cy={ty + 3} r={12.5} />
          <circle cx={114} cy={ty + 3} r={12.5} />
          <circle cx={76} cy={ty + 11} r={9} />
          <circle cx={124} cy={ty + 11} r={9} />
          <circle cx={91} cy={ty - 8} r={10} />
          <circle cx={109} cy={ty - 8} r={10} />
          <circle cx={100} cy={ty + 10} r={13} />
          <path
            d={`M95.5 ${ty + 34}C97 ${ty + 26} 97.5 ${ty + 20} 96 ${ty + 13}L100 ${ty + 16}L104 ${ty + 13}C102.5 ${ty + 20} 103 ${ty + 26} 104.5 ${ty + 34}C107 ${ty + 34.5} 110 ${ty + 35.5} 112 ${ty + 37}H88C90 ${ty + 35.5} 93 ${ty + 34.5} 95.5 ${ty + 34}Z`}
          />
        </g>
        {/* Ground line. */}
        <path d={`M80 ${ty + 37.5}H120`} stroke={c.gold} strokeWidth={2} strokeLinecap="round" />
      </g>

      {/* Ribbon: tails behind, then the band (white, green edge, gold outline). Full crest only: at icon sizes it
          is just clutter. */}
      {words ? (
        <g strokeLinejoin="round">
          <path d={TAIL_LEFT} fill={c.paper} stroke={c.gold} strokeWidth={5} />
          <path d={TAIL_RIGHT} fill={c.paper} stroke={c.gold} strokeWidth={5} />
          <path d={TAIL_LEFT} fill={c.paper} stroke={c.green} strokeWidth={2} />
          <path d={TAIL_RIGHT} fill={c.paper} stroke={c.green} strokeWidth={2} />
          <path d={FOLD_LEFT} fill={c.green} />
          <path d={FOLD_RIGHT} fill={c.green} />
          <path d={RIBBON} fill={c.paper} stroke={c.gold} strokeWidth={6} />
          <path d={RIBBON} fill={c.paper} stroke={c.green} strokeWidth={2.6} />
        </g>
      ) : null}
      {words ? (
        <g>
          <path id={ribbonId} d={RIBBON_TEXT_PATH} fill="none" />
          <text
            fill={c.green}
            textAnchor="middle"
            fontSize={10.5}
            fontWeight={800}
            letterSpacing={1.4}
            style={{
              fontFamily: "var(--font-sans), 'Helvetica Neue', Arial, sans-serif"
            }}
          >
            <textPath href={`#${ribbonId}`} startOffset="50%">
              {c.ribbon}
            </textPath>
          </text>
          <polygon points={star(18, 210, 6.5)} fill={c.gold} />
          <polygon points={star(182, 210, 6.5)} fill={c.gold} />
        </g>
      ) : null}
    </g>
  );
}

// The full crest with all its words.
export function CrestBefore({ className, title = "Greenfield crest" }: { className?: string; title?: string }) {
  const ribbonId = `gf-ribbon-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox={CREST_VIEWBOX} className={className ?? "h-28 w-[100px]"} role="img" aria-label={title}>
      {crestShapes({ words: true, treeY: 128, ribbonId })}
    </svg>
  );
}

// The crest without words or ribbon, for small sizes. `inverted` is kept for older callers: the white shield with its gold
// edge reads on both light and dark green backgrounds, so it draws the same either way.
export function LogoMarkBefore({ className }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox={MARK_VIEWBOX} className={className ?? "h-10 w-9"} aria-hidden="true">
      {crestShapes({ words: false, treeY: MARK_TREE_Y })}
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
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMarkBefore className="h-10 w-9 shrink-0" />
      <span className="leading-none">
        <span
          className={cn(
            "block font-display text-[1.15rem] font-semibold",
            inverted ? "text-white" : "text-brand-green"
          )}
        >
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
