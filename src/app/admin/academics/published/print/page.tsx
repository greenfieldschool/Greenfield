import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ChevronLeft } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { loadPublishedReport, publishedViewer, readPublishedKey } from "@/lib/published-results";
import ReportCard from "@/components/report-card";
import PrintButton from "@/components/print-button";
import { Alert } from "@/components/ui/alert";

const LIST = "/admin/academics/published";

function url(path: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  return `${path}?${q.toString()}`;
}

// Report cards of a published class (or one pupil, student_id), printed from the saved copy: the same cards
// parents saw when the results were published. One A4 page each.
export default async function PrintPublishedReportCardsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const key = readPublishedKey(sp);
  const studentId = (Array.isArray(sp.student_id) ? sp.student_id[0] : sp.student_id)?.trim() ?? "";
  const showPositions = sp.positions !== "0";
  const { scope } = await publishedViewer(supabase);

  const result = key && scope.kind !== "none" ? await loadPublishedReport(supabase, key, scope) : { kind: "not-found" as const };
  if (result.kind !== "ok") {
    return (
      <div className="space-y-4">
        <Link href={LIST} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-green">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Published results
        </Link>
        <Alert tone={result.kind === "error" ? "danger" : "warning"} title="These report cards aren't available">
          {result.kind === "error" ? result.message : "They may have been unpublished, or they belong to a class you don't teach."}
        </Alert>
      </div>
    );
  }

  const { report, params } = result;
  const students = studentId ? report.students.filter((r) => r.student.id === studentId) : report.students;
  const here = { ...params, student_id: studentId || undefined };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <Link href={url(`${LIST}/view`, params)} className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-green">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          {report.cls.name} · {report.term.name}
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          {studentId ? (
            <Link href={url(`${LIST}/print`, params)} className="text-sm font-semibold text-brand-green-700 hover:underline">
              Whole class
            </Link>
          ) : null}
          <Link
            href={url(`${LIST}/print`, { ...here, positions: showPositions ? "0" : undefined })}
            className="text-sm font-semibold text-brand-green-700 hover:underline"
          >
            {showPositions ? "Hide positions" : "Show positions"}
          </Link>
          <PrintButton label={students.length > 1 ? `Print ${students.length} report cards` : "Print report card"} />
        </div>
      </div>
      {students.length ? (
        <div className="space-y-6 print:space-y-0">
          {students.map((r) => (
            <ReportCard key={r.student.id} report={report} student={r} showPositions={showPositions} />
          ))}
        </div>
      ) : (
        <Alert tone="info">{studentId ? "That pupil isn't in these published results." : "No pupils to show."}</Alert>
      )}
    </div>
  );
}
