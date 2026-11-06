import type { CSSProperties } from "react";
import { Award as AwardIcon, HeartHandshake, Trophy } from "lucide-react";
import { Crest, LogoMark, schoolName } from "@/components/ui/logo";
import { school } from "@/lib/school";
import type { Award, AwardTier } from "@/lib/certificates";
import type { ClassReport, StudentReport } from "@/lib/term-report";
import { NO_SIGNATURES, type CertificateSignatures } from "@/lib/signatures";
import { cn } from "@/lib/cn";

// A printable certificate of achievement: A4 landscape, one per page. Every size is in cqw (a share of the
// certificate's own width), so the same design scales from a phone screen to the printed page.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function longDate(value: string | null) {
  if (!value) return null;
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : null;
}

const SEAL: Record<AwardTier, { face: string; ring: string; ink: string; ribbon: string }> = {
  gold: { face: "linear-gradient(145deg, #F4DA85, #D4A017 55%, #B08310)", ring: "#8A6511", ink: "#5C4315", ribbon: "#D4A017" },
  silver: { face: "linear-gradient(145deg, #F1F5F9, #CBD5E1 55%, #94A3B8)", ring: "#64748B", ink: "#334155", ribbon: "#94A3B8" },
  bronze: { face: "linear-gradient(145deg, #F3C9A5, #C9814B 55%, #9A5B2E)", ring: "#7A4520", ink: "#4A2A12", ribbon: "#B8733F" }
};

const cq = (n: number): CSSProperties => ({ fontSize: `${n}cqw` });

export default function Certificate({
  report,
  student,
  award,
  issuedOn,
  signatures = NO_SIGNATURES,
  className
}: {
  report: ClassReport;
  student: StudentReport;
  award: Award;
  /** YYYY-MM-DD; the publication date, or today for a preview. */
  issuedOn: string | null;
  /** Saved signatures for the class teacher and head teacher lines (lib/signatures.ts). */
  signatures?: CertificateSignatures;
  className?: string;
}) {
  const s = student.student;
  const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
  const seal = SEAL[award.tier];
  const Icon = award.kind === "position" ? Trophy : award.kind === "welfare" ? HeartHandshake : AwardIcon;
  const corner = "absolute h-[6cqw] w-[6cqw] border-brand-gold-500";

  return (
    <article
      className={cn("gf-certificate mx-auto w-full max-w-[297mm] overflow-hidden rounded-xl bg-white shadow-card", className)}
      style={{ containerType: "inline-size" }}
      aria-label={`${award.heading}: ${name}, ${award.title}`}
    >
      <div className="gf-certificate-sheet relative aspect-[297/210] bg-[#FFFDF6] p-[2.2cqw] text-slate-900">
        {/* Frame: green double rule, gold inner rule and gold corners. */}
        <div className="relative flex h-full flex-col items-center border-[0.45cqw] border-double border-brand-green-800 px-[5cqw] pb-[2.4cqw] pt-[2.6cqw] text-center">
          <div className="pointer-events-none absolute inset-[0.9cqw] border border-brand-gold-400" aria-hidden="true" />
          <span className={cn(corner, "left-[1.6cqw] top-[1.6cqw] border-l-[0.3cqw] border-t-[0.3cqw]")} aria-hidden="true" />
          <span className={cn(corner, "right-[1.6cqw] top-[1.6cqw] border-r-[0.3cqw] border-t-[0.3cqw]")} aria-hidden="true" />
          <span className={cn(corner, "bottom-[1.6cqw] left-[1.6cqw] border-b-[0.3cqw] border-l-[0.3cqw]")} aria-hidden="true" />
          <span className={cn(corner, "bottom-[1.6cqw] right-[1.6cqw] border-b-[0.3cqw] border-r-[0.3cqw]")} aria-hidden="true" />
          <LogoMark className="pointer-events-none absolute left-1/2 top-1/2 h-[34cqw] w-[31cqw] -translate-x-1/2 -translate-y-1/2 opacity-[0.045]" />

          {/* School */}
          <Crest className="relative h-[11.6cqw] w-[10.4cqw]" section={report.cls?.level} title={`${schoolName(report.cls?.level)} crest`} />
          <div className="relative mt-[0.6cqw] font-display font-bold uppercase tracking-[0.18em] text-brand-green-900" style={cq(2.1)}>
            {schoolName(report.cls?.level)}
          </div>
          <div className="relative text-slate-500" style={cq(0.95)}>
            {school.address}
          </div>

          {/* Award */}
          <h2 className="relative mt-[1.8cqw] font-display font-semibold leading-tight text-brand-green-900" style={cq(4.3)}>
            {award.heading}
          </h2>
          <div className="relative mt-[1.2cqw] uppercase tracking-[0.2em] text-slate-500" style={cq(1.15)}>
            This is proudly presented to
          </div>
          <div className="relative mt-[0.7cqw] max-w-full border-b-[0.2cqw] border-brand-gold-400 px-[3cqw] pb-[0.5cqw] font-display font-bold leading-tight text-slate-900" style={cq(4.6)}>
            {name}
          </div>
          <div className="relative mt-[1.3cqw] font-semibold" style={{ ...cq(2), color: seal.ink }}>
            {award.title}
          </div>
          <p className="relative mt-[0.6cqw] max-w-[78%] leading-snug text-slate-600" style={cq(1.45)}>
            for {award.reason}.
          </p>
          <div className="relative mt-[0.6cqw] text-slate-500" style={cq(1.2)}>
            {[report.cls.name, report.term.name, report.year?.name].filter(Boolean).join(" · ")}
            {longDate(issuedOn) ? ` · Given on ${longDate(issuedOn)}` : ""}
          </div>

          {/* Signatures and seal */}
          <div className="relative mb-[1.6cqw] mt-auto grid w-full grid-cols-[1fr_auto_1fr] items-end gap-[4cqw]">
            {[
              { role: "Class teacher", sig: signatures.classTeacher },
              { role: signatures.headTitle, sig: signatures.head }
            ].map(({ role, sig }, i) => (
              <div key={i} className={cn("flex", i === 1 ? "order-3 justify-end" : "justify-start")}>
                <div className="w-[24cqw] text-center">
                  {/* Saved signature sits on the line; without one the line stays blank for signing by hand. */}
                  <div className="flex h-[5.5cqw] items-end justify-center">
                    {sig ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={sig.image} alt={`Signed by ${sig.name}`} className="max-h-full max-w-full object-contain" />
                    ) : null}
                  </div>
                  <div className="border-t border-dotted border-slate-500 pt-[0.4cqw] text-slate-600" style={cq(1.1)}>
                    {sig ? (
                      <>
                        <span className="font-semibold text-slate-800">{sig.name}</span>
                        <span> · {role}</span>
                      </>
                    ) : (
                      role
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div className="relative order-2 flex flex-col items-center" aria-hidden="true">
              <div className="absolute top-[7cqw] flex gap-[1.2cqw]">
                <span className="block h-[4cqw] w-[2.2cqw] -rotate-[18deg]" style={{ background: seal.ribbon, clipPath: "polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)" }} />
                <span className="block h-[4cqw] w-[2.2cqw] rotate-[18deg]" style={{ background: seal.ribbon, clipPath: "polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)" }} />
              </div>
              <div
                className="relative flex h-[9cqw] w-[9cqw] flex-col items-center justify-center rounded-full shadow-sm"
                style={{ background: seal.face, boxShadow: `0 0 0 0.35cqw #fff, 0 0 0 0.55cqw ${seal.ring}` }}
              >
                <Icon className="h-[3.2cqw] w-[3.2cqw]" style={{ color: seal.ink }} strokeWidth={1.75} />
                <span className="mt-[0.2cqw] font-bold uppercase tracking-wider" style={{ ...cq(0.85), color: seal.ink }}>
                  {award.tier}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
