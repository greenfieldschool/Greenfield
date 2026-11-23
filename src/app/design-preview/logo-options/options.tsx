// Draft crest options for the school to compare (Nov 2026). Not used anywhere in the app yet.
// Each option follows the merchandise rules in the brand-logo skill: flat spot colours (green, gold, white), no
// gradients or clip paths, nothing thinner than ~1.5 units, and a one-colour version.

export type OptionTone = "color" | "mono";

const GREEN = "#0B3D2E";
const GOLD = "#C9961A";
const WHITE = "#FFFFFF";

// field: the big shape; on: drawing on the field; accent: gold on the field; accentPaper: gold on white; edge: outline.
const TONES: Record<OptionTone, { field: string; on: string; accent: string; accentPaper: string; edge: string }> = {
  color: { field: GREEN, on: WHITE, accent: GOLD, accentPaper: GOLD, edge: GOLD },
  mono: { field: GREEN, on: WHITE, accent: WHITE, accentPaper: GREEN, edge: GREEN }
};

const serif = { fontFamily: "var(--font-display), Georgia, 'Times New Roman', serif" };
const sans = { fontFamily: "var(--font-sans), 'Helvetica Neue', Arial, sans-serif" };
const f = (n: number) => n.toFixed(2);

function wedges(cx: number, cy: number, inner: number, outer: number, degs: number[], half: number) {
  const p = (r: number, a: number) => `${f(cx + r * Math.cos(a))} ${f(cy + r * Math.sin(a))}`;
  return degs
    .map((deg) => {
      const a = (deg * Math.PI) / 180;
      const w = (half * Math.PI) / 180;
      return `M${p(inner, a)}L${p(outer, a - w)}L${p(outer, a + w)}Z`;
    })
    .join("");
}

type Props = { tone?: OptionTone; className?: string; title?: string };

/* ── Option A: the light tree ─────────────────────────────────────────────────────────────────────────────────────
   One symbol instead of five: a gold oak that gives off light, standing on a hill ploughed into rows (a green
   field). The sun and the tree become one picture.
   One motto only, on the ribbon. The school's name sits beside or under the shield, not inside it. */
const SHIELD_A = "M24 16H176V104C176 158 144 192 100 212C56 192 24 158 24 104Z";

// Oak crown: wider than tall, lobed all round, centred on (cx, cy).
export function oak(cx: number, cy: number, rx: number, ry: number, lobes: number, lobeR: number) {
  let d = "";
  for (let i = 0; i <= lobes; i++) {
    const a = (Math.PI * 2 * i) / lobes - Math.PI / 2;
    const x = f(cx + rx * Math.cos(a));
    const y = f(cy + ry * Math.sin(a));
    d += i === 0 ? `M${x} ${y}` : `A${lobeR} ${lobeR} 0 0 1 ${x} ${y}`;
  }
  return d + "Z";
}
// Short rays of light round the top of the crown, a fixed gap outside its edge.
export function halo(cx: number, cy: number, rx: number, ry: number, gap: number, len: number, degs: number[], half: number) {
  const out: string[] = [];
  for (const deg of degs) {
    const a = (deg * Math.PI) / 180;
    const w = (half * Math.PI) / 180;
    const edge = (rx * ry) / Math.sqrt((ry * Math.cos(a)) ** 2 + (rx * Math.sin(a)) ** 2);
    const p = (r: number, ang: number) => `${f(cx + r * Math.cos(ang))} ${f(cy + r * Math.sin(ang))}`;
    out.push(`M${p(edge + gap, a)}L${p(edge + gap + len, a - w)}L${p(edge + gap + len, a + w)}Z`);
  }
  return out.join("");
}

function LightTree({ tone, small = false }: { tone: OptionTone; small?: boolean }) {
  const c = TONES[tone];
  const degs = small ? [-162, -126, -90, -54, -18] : [-165, -140, -115, -90, -65, -40, -15];
  return (
    <>
      <path d={SHIELD_A} fill={c.field} stroke={c.edge} strokeWidth={small ? 9 : 6} strokeLinejoin="round" />
      <g transform="translate(100 112) scale(0.88) translate(-100 -112)">
        {small ? null : <path d={SHIELD_A} fill="none" stroke={c.on} strokeWidth={2} strokeLinejoin="round" />}
        {/* The light the tree gives off */}
        <path d={halo(100, 96, 46, 34, small ? 8 : 7, small ? 16 : 13, degs, small ? 7 : 4.5)} fill={c.accent} />
        {/* Gold oak crown, branches showing through in green */}
        <path d={oak(100, 96, 46, 34, small ? 9 : 13, small ? 18 : 13)} fill={c.accent} />
        {small ? null : (
          <path
            d="M98.5 130L97 112L84 100L86.5 97.5L98.5 107L99 92L101 92L101.5 107L113.5 97.5L116 100L103 112L101.5 130Z"
            fill={c.field}
          />
        )}
        {/* Trunk, white like the field it stands on */}
        <path d="M93 168C96 156 97 146 96.5 128H103.5C103 146 104 156 107 168Z" fill={c.on} />
        {/* The field: a white hill ploughed into green rows */}
        <path d="M30 160Q100 138 170 160C158 184 134 200 100 210C66 200 42 184 30 160Z" fill={c.on} />
        {small ? null : (
          <path d="M100 152L98.4 210H101.6ZM96 152L80 204L83.2 205ZM104 152L120 204L116.8 205ZM92 152L62 192L64.8 194ZM108 152L138 192L135.2 194Z" fill={c.field} />
        )}
      </g>
    </>
  );
}

export function OptionA({ tone = "color", className, title = "Option A: the light tree" }: Props) {
  const c = TONES[tone];
  return (
    <svg viewBox="0 0 200 244" className={className} role="img" aria-label={title}>
      <LightTree tone={tone} />
      {/* Single motto */}
      <path d="M22 206Q100 226 178 206V228Q100 248 22 228Z" fill={WHITE} stroke={c.edge} strokeWidth={3} strokeLinejoin="round" />
      <path id="optA-r" d="M30 222Q100 241 170 222" fill="none" />
      <text fill={c.field} fontSize={12.5} fontWeight={800} letterSpacing={0.6} style={sans}>
        <textPath href="#optA-r" startOffset="50%" textAnchor="middle">
          KNOWLEDGE IS LIGHT
        </textPath>
      </text>
    </svg>
  );
}

/** Option A shield alone, simplified for icons and small spots. */
export function OptionAMark({ tone = "color", className }: Props) {
  return (
    <svg viewBox="16 8 168 212" className={className} role="img" aria-label="Greenfield School">
      <LightTree tone={tone} small />
    </svg>
  );
}

/* ── Option B: the seal ───────────────────────────────────────────────────────────────────────────────────────────
   A round seal, the traditional shape for an official stamp and a school badge. An open book whose pages are a
   ploughed green field, with the sun of knowledge rising from it. Name and motto run round the ring, so the middle
   is one clear picture. Works as a stamp, a blazer badge, a medal and the round photo spot on social media. */
export function OptionB({ tone = "color", className, title = "Option B: the seal", uid = "optB" }: Props & { uid?: string }) {
  const c = TONES[tone];
  const top = `${uid}-top`;
  const bottom = `${uid}-bottom`;
  return (
    <svg viewBox="0 0 220 220" className={className} role="img" aria-label={title}>
      <circle cx={110} cy={110} r={106} fill={c.field} />
      <circle cx={110} cy={110} r={101} fill="none" stroke={c.edge} strokeWidth={3} />
      <circle cx={110} cy={110} r={70} fill={WHITE} stroke={c.edge} strokeWidth={4} />
      <path id={top} d="M30 110A80 80 0 0 1 190 110" fill="none" />
      <path id={bottom} d="M17 110A93 93 0 0 0 203 110" fill="none" />
      <text fill={c.on} fontSize={17} fontWeight={700} letterSpacing={2.2} style={serif}>
        <textPath href={`#${top}`} startOffset="50%" textAnchor="middle">
          GREENFIELD SCHOOL
        </textPath>
      </text>
      <text fill={c.on} fontSize={11.5} fontWeight={700} letterSpacing={2.6} style={sans}>
        <textPath href={`#${bottom}`} startOffset="50%" textAnchor="middle">
          KNOWLEDGE IS LIGHT
        </textPath>
      </text>
      {/* Gold dots between the two lines of words */}
      <circle cx={21} cy={116} r={3.4} fill={c.accent} />
      <circle cx={199} cy={116} r={3.4} fill={c.accent} />
      {/* Sun rising from the book */}
      <path d={wedges(110, 122, 28, 52, [-160, -140, -120, -100, -80, -60, -40, -20], 4.2)} fill={c.accentPaper} />
      <circle cx={110} cy={122} r={22} fill={c.accentPaper} />
      {/* Open book: two pages, each a ploughed field */}
      <path d="M110 128C96 119 76 117 58 121V156C76 152 96 154 110 163Z" fill={c.field} />
      <path d="M110 128C124 119 144 117 162 121V156C144 152 124 154 110 163Z" fill={c.field} />
      <path
        d="M66 129.5C80 127 95 128.5 104 133L104 136.4C95 132 80 130.5 66 133ZM66 139C80 136.5 95 138 104 142.5L104 145.9C95 141.5 80 140 66 142.4ZM66 148.5C80 146 95 147.5 104 152L104 155.4C95 151 80 149.5 66 151.9Z"
        fill={c.on}
      />
      <path
        d="M154 129.5C140 127 125 128.5 116 133L116 136.4C125 132 140 130.5 154 133ZM154 139C140 136.5 125 138 116 142.5L116 145.9C125 141.5 140 140 154 142.4ZM154 148.5C140 146 125 147.5 116 152L116 155.4C125 151 140 149.5 154 151.9Z"
        fill={c.on}
      />
    </svg>
  );
}

/** Option B middle only (no ring words), for icons. */
export function OptionBMark({ tone = "color", className }: Props) {
  const c = TONES[tone];
  return (
    <svg viewBox="0 0 220 220" className={className} role="img" aria-label="Greenfield School">
      <circle cx={110} cy={110} r={104} fill={c.field} stroke={c.edge} strokeWidth={8} />
      <path d={wedges(110, 116, 38, 76, [-160, -130, -100, -80, -50, -20], 6)} fill={c.accent} />
      <circle cx={110} cy={116} r={32} fill={c.accent} />
      <path d="M110 124C90 110 62 108 38 114V166C62 160 90 162 110 176Z" fill={c.on} />
      <path d="M110 124C130 110 158 108 182 114V166C158 160 130 162 110 176Z" fill={c.on} />
      <path d="M50 132C70 128 92 130 104 137V143C92 136 70 134 50 138ZM50 148C70 144 92 146 104 153V159C92 152 70 150 50 154Z" fill={c.field} />
      <path d="M170 132C150 128 128 130 116 137V143C128 136 150 134 170 138ZM170 148C150 144 128 146 116 153V159C128 152 150 150 170 154Z" fill={c.field} />
    </svg>
  );
}

/* ── Option C: the G of light ─────────────────────────────────────────────────────────────────────────────────────
   A modern mark: a bold G on a plain shield, with a small sun shining in the opening of the G.
   Reads at 16px as a browser icon and on a bus or a gate sign from across the road. The name and motto are set
   beside it as words, so they can always be read. */
const SHIELD_C = "M30 18H170V108C170 158 138 192 100 210C62 192 30 158 30 108Z";
// G: ring from the upper right, round the left, to the right; then the bar into the middle.
const G_PATH = "M125.24 79.96A44 44 0 1 0 144 116L144 110L103 110L103 124L125.8 124A27 27 0 1 1 115.49 93.88Z";

export function OptionC({ tone = "color", className, title = "Option C: the G of light" }: Props) {
  const c = TONES[tone];
  return (
    <svg viewBox="22 10 156 208" className={className} role="img" aria-label={title}>
      <path d={SHIELD_C} fill={c.field} stroke={c.edge} strokeWidth={7} strokeLinejoin="round" />
      <path d={G_PATH} fill={c.on} />
      {/* The sun, held in the mouth of the G */}
      <circle cx={134.6} cy={96} r={9} fill={c.accent} />
      <path d={wedges(134.6, 96, 13.5, 23, [-80, -45, -10, 25], 9)} fill={c.accent} />
    </svg>
  );
}

/** Mark + words, the way each option would sit in a header or on a letterhead. */
export function Lockup({
  mark,
  motto = "Knowledge is Light",
  dark = false
}: {
  mark: React.ReactNode;
  motto?: string | false;
  dark?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      {mark}
      <div className="leading-tight">
        <div className={dark ? "font-display text-2xl font-semibold text-white" : "font-display text-2xl font-semibold text-[#0B3D2E]"}>
          Greenfield
        </div>
        <div className={dark ? "text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[#D4A72C]" : "text-[0.65rem] font-semibold uppercase tracking-[0.22em] text-[#8A6511]"}>
          School · Lekki, Lagos
        </div>
        {motto ? <div className={dark ? "mt-1 text-xs italic text-white/75" : "mt-1 text-xs italic text-slate-600"}>{motto}</div> : null}
      </div>
    </div>
  );
}
