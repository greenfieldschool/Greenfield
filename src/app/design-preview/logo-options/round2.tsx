import { halo, oak } from "./options";

// Round 2 crest drafts, drawn from the school's story in docs/crest-brief.md (Nov 2026). Not used in the app yet.
// Same rules as round 1: green, gold and white, flat colours, nothing thinner than ~1.5 units, one-colour version.

export type R2Tone = "color" | "mono";

const GREEN = "#0B3D2E";
const GOLD = "#C9961A";
const WHITE = "#FFFFFF";

const serif = { fontFamily: "var(--font-display), Georgia, 'Times New Roman', serif" };
const sans = { fontFamily: "var(--font-sans), 'Helvetica Neue', Arial, sans-serif" };
const f = (n: number) => n.toFixed(2);

function star(cx: number, cy: number, r: number, inner = 0.45) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${f(cx + rad * Math.cos(a))},${f(cy + rad * Math.sin(a))}`);
  }
  return pts.join(" ");
}

const SHIELD = "M24 16H176V104C176 158 144 192 100 212C56 192 24 158 24 104Z";
const INSET = "translate(100 112) scale(0.88) translate(-100 -112)";

type Ink = { leaf: string; vein: string; accent: string };

/* ── Concept D: the seedling and the star ────────────────────────────────────────────────────────────────────────
   A seedling rising from an open field ("green field": anyone, from any background, can grow here). Its two leaves are
   character and academics, equal and from one stem, opening upward like arms reaching for the star above: excel, be
   the best anywhere. Readings we hit and removed: two leaves making a heart, split down the middle, read as a broken
   heart; leaves curving inward round the star read as a crescent and star. Keep the leaves open and the star free. */
const LEAF_L = "M100 128C93 104 75 87 46 82C55 106 74 123 100 128Z";
const LEAF_R = "M100 128C107 104 125 87 154 82C145 106 126 123 100 128Z";

function Seedling({ ink, rows = true, detail = true }: { ink: Ink; rows?: boolean; detail?: boolean }) {
  return (
    <>
      <path d={LEAF_L} fill={ink.leaf} />
      <path d={LEAF_R} fill={ink.leaf} />
      {detail ? (
        <path d="M95 124C84 108 70 96 54 88M105 124C116 108 130 96 146 88" fill="none" stroke={ink.vein} strokeWidth={2.4} strokeLinecap="round" />
      ) : null}
      <polygon points={star(100, detail ? 66 : 62, detail ? 18 : 23)} fill={ink.accent} />
      <path d="M100 180V124" stroke={ink.leaf} strokeWidth={detail ? 5 : 7} strokeLinecap="round" />
      {rows ? (
        <path
          d={detail ? "M42 182Q100 166 158 182M58 196Q100 184 142 196M74 208Q100 200 126 208" : "M40 184Q100 166 160 184M62 200Q100 188 138 200"}
          fill="none"
          stroke={ink.accent}
          strokeWidth={detail ? 4.5 : 7}
          strokeLinecap="round"
        />
      ) : null}
    </>
  );
}

const D_INK: Record<R2Tone, Ink> = {
  color: { leaf: WHITE, vein: GREEN, accent: GOLD },
  mono: { leaf: WHITE, vein: GREEN, accent: WHITE }
};
// On white paper (inside a seal): green leaves.
const D_INK_PAPER: Record<R2Tone, Ink> = {
  color: { leaf: GREEN, vein: WHITE, accent: GOLD },
  mono: { leaf: GREEN, vein: WHITE, accent: GREEN }
};

type Props = { tone?: R2Tone; className?: string; small?: boolean };

export function ConceptDShield({ tone = "color", className, small = false }: Props) {
  const edge = tone === "color" ? GOLD : GREEN;
  return (
    <svg viewBox={small ? "16 8 168 212" : "14 6 172 214"} className={className} role="img" aria-label="Greenfield crest: the seedling and the star">
      <path d={SHIELD} fill={GREEN} stroke={edge} strokeWidth={small ? 9 : 6} strokeLinejoin="round" />
      <g transform={INSET}>
        {small ? null : <path d={SHIELD} fill="none" stroke={WHITE} strokeWidth={2} strokeLinejoin="round" />}
        <Seedling ink={D_INK[tone]} detail={!small} />
      </g>
    </svg>
  );
}

/** Round seal: the same picture in a ring with the name and motto, for certificates, report cards and stamps. */
export function Seal({
  tone = "color",
  className,
  uid,
  motto = "EXCELLENCE IN CHARACTER & ACADEMICS",
  picture
}: Props & { uid: string; motto?: string; picture: "A" | "D" | "E" }) {
  const gold = tone === "color" ? GOLD : WHITE;
  const edge = tone === "color" ? GOLD : GREEN;
  const top = `${uid}-t`;
  const bottom = `${uid}-b`;
  const long = motto.length > 24;
  return (
    <svg viewBox="0 0 220 220" className={className} role="img" aria-label="Greenfield School seal">
      <circle cx={110} cy={110} r={106} fill={GREEN} />
      <circle cx={110} cy={110} r={101} fill="none" stroke={edge === GREEN ? WHITE : edge} strokeWidth={2.5} />
      <circle cx={110} cy={110} r={70} fill={WHITE} stroke={edge === GREEN ? GREEN : edge} strokeWidth={4} />
      <path id={top} d="M30 110A80 80 0 0 1 190 110" fill="none" />
      <path id={bottom} d={long ? "M19 110A91 91 0 0 0 201 110" : "M17 110A93 93 0 0 0 203 110"} fill="none" />
      <text fill={WHITE} fontSize={17} fontWeight={700} letterSpacing={2.2} style={serif}>
        <textPath href={`#${top}`} startOffset="50%" textAnchor="middle">
          GREENFIELD SCHOOL
        </textPath>
      </text>
      <text fill={WHITE} fontSize={long ? 9.2 : 11.5} fontWeight={700} letterSpacing={long ? 0.9 : 2.6} style={sans}>
        <textPath href={`#${bottom}`} startOffset="50%" textAnchor="middle">
          {motto}
        </textPath>
      </text>
      <polygon points={star(21, 116, 4.6)} fill={gold} />
      <polygon points={star(199, 116, 4.6)} fill={gold} />
      <g transform="translate(110 113) scale(0.62) translate(-100 -126)">
        {picture === "A" ? (
          <LightOak ink={A_INK_PAPER[tone]} />
        ) : picture === "D" ? (
          <Seedling ink={D_INK_PAPER[tone]} />
        ) : (
          <RootsAndCrown tone={tone} onPaper />
        )}
      </g>
    </svg>
  );
}

/* ── Concept E: roots and crown ──────────────────────────────────────────────────────────────────────────────────
   One tree, half above the ground and half below. Many roots, coming from every side, join into one trunk: people
   from any background, growing together. Below the ground is character (what holds a person up); above it is
   achievement, branches reaching into the light. An oak, because the school means to leave a lasting mark. */
function RootsAndCrown({ tone, onPaper = false, small = false }: { tone: R2Tone; onPaper?: boolean; small?: boolean }) {
  const sun = tone === "color" ? GOLD : onPaper ? GREEN : WHITE;
  const branch = onPaper && tone === "mono" ? WHITE : GREEN;
  const root = onPaper ? GREEN : WHITE;
  return (
    <>
      {/* The crown: the oak's branches against the light */}
      <circle cx={100} cy={84} r={small ? 52 : 48} fill={sun} />
      <Branches color={branch} small={small} />
      {/* The ground */}
      <path d="M36 136H164" stroke={sun} strokeWidth={small ? 7 : 4.5} strokeLinecap="round" />
      {/* The roots: the same tree mirrored below the ground, as deep as it is tall */}
      <g transform="translate(100 136) scale(0.92 -0.8) translate(-100 -136)">
        <Branches color={root} small={small} />
      </g>
    </>
  );
}

// Trunk, two main limbs, each splitting again, and a leader up the middle.
function Branches({ color, small }: { color: string; small: boolean }) {
  const limbs = "M100 112C92 104 84 98 76 92M100 112C108 104 116 98 124 92M100 108C100 96 100 82 100 68";
  const twigs = "M76 92C70 86 66 80 64 72M76 92C78 84 80 78 84 70M124 92C130 86 134 80 136 72M124 92C122 84 120 78 116 70";
  return (
    <>
      <path d="M95.5 136L97 104H103L104.5 136Z" fill={color} />
      <path d={limbs} fill="none" stroke={color} strokeWidth={small ? 8 : 5.5} strokeLinecap="round" />
      {small ? null : <path d={twigs} fill="none" stroke={color} strokeWidth={4.2} strokeLinecap="round" />}
    </>
  );
}

export function ConceptEShield({ tone = "color", className, small = false }: Props) {
  const edge = tone === "color" ? GOLD : GREEN;
  return (
    <svg viewBox={small ? "16 8 168 212" : "14 6 172 214"} className={className} role="img" aria-label="Greenfield crest: roots and crown">
      <path d={SHIELD} fill={GREEN} stroke={edge} strokeWidth={small ? 9 : 6} strokeLinejoin="round" />
      <g transform={INSET}>
        {small ? null : <path d={SHIELD} fill="none" stroke={WHITE} strokeWidth={2} strokeLinejoin="round" />}
        <RootsAndCrown tone={tone} small={small} />
      </g>
    </svg>
  );
}

/* ── Option A, refined: the light oak ────────────────────────────────────────────────────────────────────────────
   The option the school preferred, reworked against the brief. A gold oak gives off light (Knowledge is Light; a
   lasting mark). Its trunk rises out of an open, ploughed field with its roots spread (anyone, from any background,
   can grow here). Changes from round 1: five strong rays instead of seven small ones; the white hill with green
   furrows (it looked like a road) became three gold rows, as in D; the trunk now flares into roots; bolder branches
   so they survive stitching; a seal version for certificates. */
type OakInk = { crown: string; branch: string; trunk: string; accent: string };
const A_INK: Record<R2Tone, OakInk> = {
  color: { crown: GOLD, branch: GREEN, trunk: WHITE, accent: GOLD },
  mono: { crown: WHITE, branch: GREEN, trunk: WHITE, accent: WHITE }
};
const A_INK_PAPER: Record<R2Tone, OakInk> = {
  color: { crown: GOLD, branch: WHITE, trunk: GREEN, accent: GOLD },
  mono: { crown: GREEN, branch: WHITE, trunk: GREEN, accent: GREEN }
};

function LightOak({ ink, small = false }: { ink: OakInk; small?: boolean }) {
  return (
    <>
      {/* The field: open ground, ploughed into rows */}
      <path
        d={small ? "M38 182Q100 164 162 182M60 198Q100 186 140 198" : "M40 180Q100 166 160 180M54 193Q100 182 146 193M70 205Q100 197 130 205"}
        fill="none"
        stroke={ink.accent}
        strokeWidth={small ? 7 : 4.5}
        strokeLinecap="round"
      />
      {/* The light the oak gives off */}
      <path d={halo(100, 92, 46, 34, small ? 9 : 9, small ? 18 : 15, small ? [-145, -90, -35] : [-150, -120, -90, -60, -30], small ? 9 : 6)} fill={ink.accent} />
      {/* The gold crown, with its branches */}
      <path d={oak(100, 92, 46, 34, small ? 9 : 13, small ? 18 : 13)} fill={ink.crown} />
      {small ? null : (
        <path d="M100 126V96M100 116L84 101M100 111L116 96" fill="none" stroke={ink.branch} strokeWidth={4.2} strokeLinecap="round" />
      )}
      {/* The trunk, rising out of the field with its roots spread */}
      <path
        d={
          small
            ? "M80 174C89 171 94 165 95 156C96 146 96 136 95.5 122H104.5C104 136 104 146 105 156C106 165 111 171 120 174Z"
            : "M82 174C90 171 95 166 96 157C97 147 97.2 137 97 124H103C102.8 137 103 147 104 157C105 166 110 171 118 174Z"
        }
        fill={ink.trunk}
      />
    </>
  );
}

export function OptionARefined({ tone = "color", className, small = false, ribbon = true }: Props & { ribbon?: boolean }) {
  const edge = tone === "color" ? GOLD : GREEN;
  const showRibbon = ribbon && !small;
  return (
    <svg
      viewBox={small ? "16 8 168 212" : showRibbon ? "0 0 200 244" : "14 6 172 214"}
      className={className}
      role="img"
      aria-label="Greenfield crest: the light oak"
    >
      <path d={SHIELD} fill={GREEN} stroke={edge} strokeWidth={small ? 9 : 6} strokeLinejoin="round" />
      <g transform={INSET}>
        {small ? null : <path d={SHIELD} fill="none" stroke={WHITE} strokeWidth={2} strokeLinejoin="round" />}
        <LightOak ink={A_INK[tone]} small={small} />
      </g>
      {showRibbon ? (
        <>
          <path d="M22 206Q100 226 178 206V228Q100 248 22 228Z" fill={WHITE} stroke={edge} strokeWidth={3} strokeLinejoin="round" />
          <path id={`a2-r-${tone}`} d="M30 222Q100 241 170 222" fill="none" />
          <text fill={GREEN} fontSize={12.5} fontWeight={800} letterSpacing={0.6} style={sans}>
            <textPath href={`#a2-r-${tone}`} startOffset="50%" textAnchor="middle">
              KNOWLEDGE IS LIGHT
            </textPath>
          </text>
        </>
      ) : null}
    </svg>
  );
}
