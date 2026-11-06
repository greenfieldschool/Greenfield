import { isValidElement, type ReactNode } from "react";
import { CREST_TREE_Y, CREST_VIEWBOX, MARK_TREE_Y, MARK_VIEWBOX, crestShapes, type CrestDetail, type CrestTone, type SchoolSection } from "@/components/ui/logo";

// Standalone SVG files of the crest for printers, embroiderers and sign makers (served by app/brand/[file]).
// Built from the same `crestShapes` as the site, turned into markup by the small serializer below (the drawing only
// uses plain SVG elements, strings and numbers, so a full React renderer isn't needed).

// React prop names that SVG writes with dashes. textLength, lengthAdjust, viewBox and startOffset stay as they are.
const DASHED = new Set([
  "strokeWidth",
  "strokeLinejoin",
  "strokeLinecap",
  "textAnchor",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "letterSpacing"
]);
const dash = (k: string) => (DASHED.has(k) ? k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`) : k);
const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function toMarkup(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return esc(String(node));
  if (Array.isArray(node)) return node.map(toMarkup).join("");
  if (!isValidElement(node) || typeof node.type !== "string") return "";
  const { children, style, ...rest } = node.props as Record<string, unknown> & { children?: ReactNode; style?: Record<string, string> };
  const attrs = Object.entries(rest)
    .filter(([, v]) => v !== undefined && v !== null)
    // Older Illustrator/CorelDRAW only read xlink:href, so write both.
    .map(([k, v]) => (k === "href" ? ` href="${esc(String(v))}" xlink:href="${esc(String(v))}"` : ` ${dash(k)}="${esc(String(v))}"`));
  if (style) for (const [k, v] of Object.entries(style)) attrs.push(` ${dash(k)}="${esc(v)}"`);
  return `<${node.type}${attrs.join("")}>${toMarkup(children)}</${node.type}>`;
}

export type CrestFile = { file: string; label: string; use: string; words: boolean; tone: CrestTone; detail?: CrestDetail; section?: SchoolSection };

// Every downloadable version, with what it is for (shown in docs/brand.md and the preview).
const SCHOOL_FILES: CrestFile[] = [
  { file: "greenfield-crest", label: "Full crest, colour", use: "Certificates, letterheads, signs, banners, white or light fabric (75mm wide or more)", words: true, tone: "color" },
  { file: "greenfield-crest-dark", label: "Full crest, dark fabric", use: "Embroidery and print on green, navy or black polos, jackets, bags", words: true, tone: "reverse" },
  { file: "greenfield-crest-mono", label: "Full crest, one colour", use: "Rubber stamps, engraving, one-colour screen print, photocopies", words: true, tone: "mono" },
  { file: "greenfield-crest-merch", label: "Merch crest, colour", use: "Small embroidery and print on light fabric: polo chests and caps from 60mm, mugs, notebooks", words: true, tone: "color", detail: "merch" },
  { file: "greenfield-crest-merch-dark", label: "Merch crest, dark fabric", use: "Small embroidery on green, navy or black polos, caps and bags (from 60mm)", words: true, tone: "reverse", detail: "merch" },
  { file: "greenfield-crest-merch-mono", label: "Merch crest, one colour", use: "One-thread embroidery, one-colour heat transfer or vinyl, small stamps", words: true, tone: "mono", detail: "merch" },
];

// The secondary section's crest ("GREENFIELD COLLEGE"): the same six worded versions, for secondary uniforms,
// certificates and signs. The shield on its own has no words, so it is shared.
const COLLEGE_FILES: CrestFile[] = SCHOOL_FILES.map((f) => ({
  ...f,
  file: f.file.replace("greenfield-crest", "greenfield-college-crest"),
  label: `College ${f.label.charAt(0).toLowerCase()}${f.label.slice(1)}`,
  use: `Secondary section: ${f.use.charAt(0).toLowerCase()}${f.use.slice(1)}`,
  section: "secondary" as const
}));

const MARK_FILES: CrestFile[] = [
  { file: "greenfield-mark", label: "Shield, colour", use: "Very small spots: pens, badges, ID cards, profile pictures, embroidery under 60mm", words: false, tone: "color" },
  { file: "greenfield-mark-dark", label: "Shield, dark fabric", use: "Small spots on dark fabric: caps, sleeves, lanyards", words: false, tone: "reverse" },
  { file: "greenfield-mark-mono", label: "Shield, one colour", use: "Small stamps, embossing, laser engraving", words: false, tone: "mono" }
];

export const CREST_FILES: CrestFile[] = [...SCHOOL_FILES, ...COLLEGE_FILES, ...MARK_FILES];

export function crestSvg({ words, tone, detail = "full", section }: { words: boolean; tone: CrestTone; detail?: CrestDetail; section?: SchoolSection }) {
  const viewBox = words ? CREST_VIEWBOX : MARK_VIEWBOX;
  const [, , w, h] = viewBox.split(" ").map(Number);
  // 1 unit = 1px; files are vector, so printers scale them freely. Text uses Fraunces and Plus Jakarta Sans
  // (free from Google Fonts); printers should convert text to outlines before production.
  const body = toMarkup(crestShapes({ words, treeY: words ? CREST_TREE_Y[detail] : MARK_TREE_Y, ribbonId: "ribbon", tone, fonts: "file", detail, section }));
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}" width="${w * 4}" height="${h * 4}">` +
    `<title>${section === "secondary" ? "Greenfield College" : "Greenfield"} crest</title>${body}</svg>\n`
  );
}
