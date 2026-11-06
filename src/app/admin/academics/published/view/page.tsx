import type { SupabaseClient } from "@supabase/supabase-js";
import { Archive, Download, Printer, Trophy, Users } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatLagosDate } from "@/lib/lagos-dates";
import { gradeRemark } from "@/lib/results";
import { ordinal } from "@/lib/term-report";
import { finalAverage, loadPublishedReport, publishedViewer, readPublishedKey } from "@/lib/published-results";
import { LEARN } from "@/lib/learn-guides";
import PrintButton from "@/components/print-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";

// One published class + term as a class list (broadsheet): every pupil ranked on the final score, with each
// subject, academic average, welfare, final score and grade. Read-only.

const LIST = "/admin/academics/published";
const LEVELS: Record<string, string> = { creche: "Creche", primary: "Primary", secondary: "Secondary" };

function url(path: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return `${path}?${q.toString()}`;
}

export default async function PublishedClassPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const key = readPublishedKey(sp);
  const { scope, isAdmin } = await publishedViewer(supabase);
  const back = { href: LIST, label: "Published results" };

  const result = key && scope.kind !== "none" ? await loadPublishedReport(supabase, key, scope) : { kind: "not-found" as const };
  if (result.kind !== "ok") {
    return (
      <div className="space-y-6">
        <PageHeader back={back} eyebrow="Published results" title="Class results" learn={LEARN.publishedResults} />
        {result.kind === "error" ? (
          <Alert tone="danger" title="These results couldn't be opened">
            {result.message}
          </Alert>
        ) : (
          <Card>
            <EmptyState
              icon={Archive}
              title="These results aren't available"
              description="They may have been unpublished, or they belong to a class you don't teach. Go back to the list to choose another class."
              action={
                <ButtonLink href={LIST} variant="secondary" size="sm">
                  Back to Published results
                </ButtonLink>
              }
            />
          </Card>
        )}
      </div>
    );
  }

  const { report, source, savedAt, publishedAt, params } = result;
  const rows = [...report.students].sort(
    (a, b) =>
      (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
      a.student.last_name.localeCompare(b.student.last_name) ||
      a.student.first_name.localeCompare(b.student.first_name)
  );
  const average = finalAverage(report);
  const top = rows.find((r) => r.position === 1 && r.termTotal !== null) ?? null;
  const ready = rows.filter((r) => r.termTotal !== null).length;
  const termName = [report.year?.name, report.term.name].filter(Boolean).join(" · ");
  const fullName = (s: (typeof rows)[number]["student"]) => [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(" ");
  const sticky = "sticky left-0 z-10 bg-white print:static";

  return (
    <div className="space-y-6">
      <PageHeader
        back={back}
        learn={LEARN.publishedResults}
        eyebrow={`Published results · ${LEVELS[report.cls.level] ?? report.cls.level}`}
        title={`${report.cls.name} · ${report.term.name}`}
        description={`${report.year?.name ? `${report.year.name} session. ` : ""}Published ${formatLagosDate(publishedAt)}. Pupils are ranked on the final score.`}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            <ButtonLink href={url(`${LIST}/print`, params)} size="sm">
              <Printer className="h-4 w-4" aria-hidden="true" />
              Print report cards
            </ButtonLink>
            <a href={url(`${LIST}/download`, params)} className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Download for Excel
            </a>
            <PrintButton label="Print this list" variant="secondary" />
          </div>
        }
      />

      {source === "live" ? (
        <Alert tone="info" title="No saved copy yet" className="print:hidden">
          These results were published before copies were kept, so they are worked out from today&apos;s records. A pupil who has changed class
          since won&apos;t be listed.{isAdmin ? " Save a copy from the Published results list to keep them as they are." : ""}
        </Alert>
      ) : (
        <p className="text-sm text-slate-500 print:hidden">
          Saved copy from {formatLagosDate(savedAt)}: these are the results exactly as published, even if pupils have since moved class.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <StatCard label="Pupils" value={rows.length} hint={ready < rows.length ? `${ready} with a final score` : "all with a final score"} icon={Users} />
        <StatCard label="Class average" value={average !== null ? `${average}` : "—"} hint="final score, /100" tone="blue" />
        <StatCard
          label="Top of the class"
          value={top ? `${top.termTotal}` : "—"}
          hint={top ? fullName(top.student) : "no final scores yet"}
          icon={Trophy}
          tone="gold"
        />
        <StatCard label="Subjects" value={report.subjects.length} hint={termName} tone="slate" />
      </div>

      <Card>
        <CardHeader
          title="Class results"
          description={`${report.cls.name} · ${termName}. Final score and grade first, then each subject out of 100 with the class average under its name.`}
        />
        {rows.length ? (
          <div className="gf-table-wrap print:overflow-visible">
            <table className="gf-table min-w-[720px] print:min-w-0 print:text-[10px]">
              <thead>
                <tr>
                  <th scope="col" className="w-12 text-right">
                    Pos.
                  </th>
                  <th scope="col" className={sticky}>
                    Pupil
                  </th>
                  <th scope="col" className="text-right">
                    Final /100
                  </th>
                  <th scope="col">Grade</th>
                  <th scope="col" className="text-right">
                    Academic
                  </th>
                  <th scope="col" className="text-right">
                    Welfare
                  </th>
                  {report.subjects.map((s) => (
                    <th key={s.id} scope="col" className="text-right">
                      <div className="whitespace-nowrap">{s.name}</div>
                      <div className="text-[11px] font-normal normal-case text-slate-500">avg {s.classAverage ?? "—"}</div>
                    </th>
                  ))}
                  <th scope="col" className="text-right print:hidden">
                    <span className="sr-only">Report card</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const bySubject = new Map(r.subjects.map((x) => [x.subjectId, x] as const));
                  return (
                    <tr key={r.student.id}>
                      <td className="text-right tabular-nums text-slate-600">{r.position ? ordinal(r.position) : "—"}</td>
                      <td className={sticky}>
                        <div className="whitespace-nowrap font-semibold text-slate-900">{fullName(r.student)}</div>
                        {r.student.admission_number ? <div className="text-xs text-slate-500">{r.student.admission_number}</div> : null}
                      </td>
                      <td className="text-right font-semibold tabular-nums text-slate-900">{r.termTotal ?? "Not ready"}</td>
                      <td className="whitespace-nowrap">
                        {r.termGrade ? (
                          <>
                            <span className="font-semibold">{r.termGrade}</span>
                            <span className="ml-1 text-xs text-slate-500">{gradeRemark(r.termGrade, report.grades)}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-right tabular-nums">{r.academicAverage ?? "—"}</td>
                      <td className="text-right tabular-nums">{r.welfare.percent ?? "—"}</td>
                      {report.subjects.map((s) => {
                        const x = bySubject.get(s.id);
                        return (
                          <td key={s.id} className="text-right tabular-nums">
                            {x?.percent ?? "—"}
                            {x?.grade ? <span className="ml-1 text-xs text-slate-500">{x.grade}</span> : null}
                          </td>
                        );
                      })}
                      <td className="text-right print:hidden">
                        <a href={url(`${LIST}/print`, { ...params, student_id: r.student.id })} className="whitespace-nowrap text-sm font-semibold text-brand-green-700 hover:underline">
                          Report card
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title="No pupils in this result" description="The class had no pupils when these results were published." />
        )}
        <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 sm:px-6">
          Subject score = the sheet&apos;s scores out of 100. Academic = average of the subject scores. Welfare = average of the weekly welfare
          scores, /100. Final score = (academic + welfare) ÷ 2; &ldquo;Not ready&rdquo; means one half was missing when published. Positions are on
          the final score; equal scores share a position.
          {report.grades.length
            ? ` Grades: ${report.grades.map((g) => `${g.grade} ${Number(g.min_score)}–${Math.round(Number(g.max_score))}${g.remark ? ` ${g.remark}` : ""}`).join(", ")}.`
            : ""}
        </p>
      </Card>
    </div>
  );
}
