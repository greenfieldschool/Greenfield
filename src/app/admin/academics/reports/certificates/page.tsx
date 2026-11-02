import Link from "next/link";
import { Award as AwardIcon } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacherAccess } from "@/lib/teacher-access";
import { buildClassReport } from "@/lib/term-report";
import { AWARD_KINDS, awardsFor, type AwardKind, type AwardTier } from "@/lib/certificates";
import { toLagosDateInput } from "@/lib/lagos-dates";
import Certificate from "@/components/certificate";
import PrintButton from "@/components/print-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { canManageClassReports, reportsUrl } from "../_shared";

const PATH = "/admin/academics/reports/certificates";

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

const TIER_CHIP: Record<AwardTier, string> = {
  gold: "border-brand-gold-300 bg-brand-gold-50 text-brand-gold-900",
  silver: "border-slate-300 bg-slate-100 text-slate-700",
  bronze: "border-orange-200 bg-orange-50 text-orange-900"
};

// Certificates of achievement for a class and term: class positions, best in each subject and welfare awards,
// worked out from the report cards. A list of who gets what, then the certificates, one per A4 landscape page.
export default async function CertificatesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const classId = str(sp.class_id);
  const termId = str(sp.term_id);
  const studentId = str(sp.student_id);
  const kindParam = str(sp.kind);
  const kind = AWARD_KINDS.some((k) => k.key === kindParam) ? (kindParam as AwardKind) : null;

  const access = await getTeacherAccess(supabase);
  if (!classId || !termId) return <Alert tone="warning">Choose a class and term on the Report cards page first.</Alert>;
  if (!canManageClassReports(access, classId)) {
    return <Alert tone="danger">Only the class teacher of this class or an admin can print its certificates.</Alert>;
  }

  const report = await buildClassReport(supabase, classId, termId);
  if (!report) return <Alert tone="danger">That class or term could not be found.</Alert>;

  const all = report.students.map((r) => ({ r, awards: awardsFor(report, r) }));
  const pupils = studentId ? all.filter((x) => x.r.student.id === studentId) : all;
  const count = (k: AwardKind | null) => pupils.reduce((n, x) => n + x.awards.filter((a) => !k || a.kind === k).length, 0);
  const shown = pupils
    .map((x) => ({ ...x, awards: x.awards.filter((a) => !kind || a.kind === kind) }))
    .filter((x) => x.awards.length)
    .sort((a, b) => (a.r.position ?? 9999) - (b.r.position ?? 9999) || a.r.student.last_name.localeCompare(b.r.student.last_name));
  const total = shown.reduce((n, x) => n + x.awards.length, 0);
  const issuedOn = toLagosDateInput(report.publication?.published_at ?? new Date().toISOString());
  const base = { class_id: classId, term_id: termId, student_id: studentId || undefined };
  const one = studentId ? pupils[0]?.r.student : null;

  return (
    <div className="space-y-6">
      <div className="space-y-6 print:hidden">
        <PageHeader
          back={{ href: reportsUrl("/admin/academics/reports", { class_id: classId, term_id: termId }), label: "Report cards" }}
          eyebrow={`${report.cls.name} · ${[report.year?.name, report.term.name].filter(Boolean).join(" · ")}`}
          title={one ? `Certificates for ${one.first_name} ${one.last_name}` : "Certificates"}
          description="Awarded automatically from the report cards: 1st, 2nd and 3rd in class on the final score, the best score in each subject, and Gold, Silver or Bronze for welfare. Each prints on its own A4 landscape page."
          actions={total ? <PrintButton label={total > 1 ? `Print ${total} certificates` : "Print certificate"} /> : null}
        />

        {!report.publication ? (
          <Alert tone="warning" title="Results not published yet">
            {report.completeness.ready
              ? "Everything is in, but scores can still change until the report cards are published. Print after publishing to be safe."
              : "Some scores, welfare ratings or comments are still missing, so positions and awards may change. Print after the report cards are published."}
          </Alert>
        ) : null}

        <LinkTabs
          active={kind ?? "all"}
          tabs={[
            { key: "all", label: "All", href: reportsUrl(PATH, base), count: count(null) },
            ...AWARD_KINDS.map((k) => ({ key: k.key, label: k.label, href: reportsUrl(PATH, { ...base, kind: k.key }), count: count(k.key) }))
          ]}
        />

        {shown.length ? (
          <Card>
            <CardHeader
              title="Who gets a certificate"
              description={`${total} certificate${total === 1 ? "" : "s"} for ${shown.length} pupil${shown.length === 1 ? "" : "s"}. Check the list, then print.`}
            />
            <ul className="divide-y divide-slate-100">
              {shown.map(({ r, awards }) => (
                <li key={r.student.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">
                      {r.student.last_name} {r.student.first_name}
                    </div>
                    <div className="text-xs text-slate-500">
                      Final score {r.termTotal ?? "—"} · Welfare {r.welfare.percent ?? "—"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 sm:justify-end">
                    {awards.map((a) => (
                      <span key={a.key} className={cn("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", TIER_CHIP[a.tier])}>
                        {a.title}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon={AwardIcon}
              title="No certificates to print"
              description={
                kind === "welfare" || !kind
                  ? "Certificates come from the report cards. Class positions and best-in-subject need scores for at least two pupils; welfare awards need a welfare score of at least the Bronze mark."
                  : "Certificates come from the report cards. Class positions and best-in-subject need scores for at least two pupils."
              }
              action={
                <Link href={reportsUrl("/admin/academics/reports", { class_id: classId, term_id: termId })} className="gf-link text-sm font-semibold">
                  Check the report cards
                </Link>
              }
            />
          </Card>
        )}
      </div>

      {shown.length ? (
        <div className="space-y-6 print:space-y-0">
          {shown.flatMap(({ r, awards }) =>
            awards.map((a) => <Certificate key={`${r.student.id}:${a.key}`} report={report} student={r} award={a} issuedOn={issuedOn} />)
          )}
        </div>
      ) : null}
    </div>
  );
}
