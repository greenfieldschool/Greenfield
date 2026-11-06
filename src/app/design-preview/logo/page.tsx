import Certificate from "@/components/certificate";
import { CrestLoader } from "@/components/motion/crest-loader";
import { Crest, Logo, LogoMark } from "@/components/ui/logo";
import { CREST_FILES } from "@/lib/crest-svg";
import type { ClassReport, StudentReport } from "@/lib/term-report";
import { CrestBefore, LogoMarkBefore } from "./before";

// Dev-only preview of the crest at the sizes it is used, with the previous drawing for comparison.

// Just the fields the certificate reads.
const report = { cls: { name: "JSS 2 Gold", level: "secondary" }, term: { name: "First Term" }, year: { name: "2026/2027" } } as unknown as ClassReport;
const student = { student: { first_name: "Adaeze", middle_name: "Chioma", last_name: "Okafor" } } as unknown as StudentReport;

function Label({ children }: { children: string }) {
  return <div className="mt-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">{children}</div>;
}

export default function LogoPreview() {
  return (
    <main className="space-y-10 bg-slate-50 p-8">
      <section className="flex flex-wrap items-end gap-10">
        <div>
          <CrestBefore className="h-[336px] w-[300px]" />
          <Label>Before</Label>
        </div>
        <div>
          <Crest className="h-[336px] w-[300px]" />
          <Label>After</Label>
        </div>
        <div>
          <Crest tone="mono" className="h-[336px] w-[300px]" />
          <Label>One colour (stamps, engraving)</Label>
        </div>
        <div className="rounded-2xl bg-[#0B3D2E] p-4">
          <Crest tone="reverse" className="h-[336px] w-[300px]" />
          <div className="mt-2 text-center text-xs font-semibold uppercase tracking-wider text-white/70">Dark fabric (polos, caps)</div>
        </div>
        <div className="rounded-2xl bg-[#1f2937] p-4">
          <LogoMark tone="reverse" className="h-24 w-[72px]" />
        </div>
      </section>
      {/* Merch edition next to the full crest at 60mm wide (≈227px at 96 dpi), the smallest polo-chest size. */}
      <section className="flex flex-wrap items-end gap-8">
        <div>
          <Crest className="h-[254px] w-[227px]" />
          <Label>Full crest at 60mm</Label>
        </div>
        <div>
          <Crest detail="merch" className="h-[254px] w-[227px]" />
          <Label>Merch crest at 60mm</Label>
        </div>
        <div className="rounded-2xl bg-[#0B3D2E] p-3">
          <Crest detail="merch" tone="reverse" className="h-[254px] w-[227px]" />
        </div>
        <div>
          <Crest detail="merch" tone="mono" className="h-[254px] w-[227px]" />
          <Label>Merch, one colour</Label>
        </div>
        <div className="rounded-2xl bg-[#1e3a5f] p-3">
          <Crest detail="merch" tone="reverse" className="h-[134px] w-[120px]" />
        </div>
      </section>
      <section className="flex flex-wrap items-end gap-8">
        <div className="flex items-end gap-4">
          <LogoMarkBefore className="h-24 w-[72px]" />
          <LogoMarkBefore className="h-10 w-9" />
          <LogoMarkBefore className="h-6 w-5" />
          <Label>Before</Label>
        </div>
        <div className="flex items-end gap-4">
          <LogoMark className="h-24 w-[72px]" />
          <LogoMark className="h-10 w-9" />
          <LogoMark className="h-6 w-5" />
          <LogoMark tone="mono" className="h-10 w-9" />
          <Label>After</Label>
        </div>
        <Crest className="h-28 w-[100px]" />
        <Crest section="secondary" className="h-28 w-[100px]" />
        <Crest section="secondary" detail="merch" className="h-28 w-[100px]" />
        <div className="rounded-xl bg-brand-green-900 p-5">
          <Crest className="h-40 w-[143px]" />
        </div>
        <Logo />
        <span className="rounded-xl bg-brand-green-900 p-4">
          <Logo inverted subtitle="Staff dashboard" />
        </span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon" alt="" className="h-16 w-16" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/app-icon/192-maskable" alt="" className="h-16 w-16 rounded-full" />
      </section>
      <section id="loader" className="rounded-2xl border border-slate-200 bg-white">
        <CrestLoader className="py-12" />
      </section>
      <section>
        <h2 className="font-semibold">Print files</h2>
        <ul className="mt-2 grid gap-1 text-sm">
          {CREST_FILES.map((f) => (
            <li key={f.file}>
              <a className="gf-link" href={`/brand/${f.file}.svg`}>
                {f.label}
              </a>{" "}
              — {f.use}
            </li>
          ))}
        </ul>
      </section>
      <section className="max-w-4xl">
        <Certificate
          report={report}
          student={student}
          award={{ key: "x", kind: "position" as never, tier: "gold", heading: "Certificate of Excellence", title: "1st in class", reason: "coming first in JSS 2 Gold" }}
          issuedOn="2026-12-12"
        />
      </section>
    </main>
  );
}
