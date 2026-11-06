import { CREST_FILES, crestSvg } from "@/lib/crest-svg";

// Print-ready crest files: /brand/greenfield-crest.svg, /brand/greenfield-mark-dark.svg … (list in lib/crest-svg.ts).
export function generateStaticParams() {
  return CREST_FILES.map((f) => ({ file: `${f.file}.svg` }));
}

export function GET(_req: Request, { params }: { params: { file: string } }) {
  const entry = CREST_FILES.find((f) => `${f.file}.svg` === params.file);
  if (!entry) return new Response("Not found", { status: 404 });
  return new Response(crestSvg(entry), {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": `inline; filename="${entry.file}.svg"`,
      "Cache-Control": "public, max-age=3600"
    }
  });
}
