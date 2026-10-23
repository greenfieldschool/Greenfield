import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacherAccess } from "@/lib/teacher-access";
import { buildClassReport } from "@/lib/term-report";
import ReportCard from "@/components/report-card";
import PrintButton from "@/components/print-button";
import { Alert } from "@/components/ui/alert";
import { canManageClassReports, reportsUrl } from "../_shared";

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

// Printable report cards: one pupil (student_id) or the whole class, one A4 page each.
export default async function PrintReportCardsPage({
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
  const showPositions = str(sp.positions) !== "0";

  const access = await getTeacherAccess(supabase);
  if (!classId || !termId) return <Alert tone="warning">Choose a class and term on the Report cards page first.</Alert>;
  if (!canManageClassReports(access, classId)) {
    return <Alert tone="danger">Only the class teacher of this class or an admin can print its report cards.</Alert>;
  }

  const report = await buildClassReport(supabase, classId, termId);
  if (!report) return <Alert tone="danger">That class or term could not be found.</Alert>;
  const students = studentId ? report.students.filter((r) => r.student.id === studentId) : report.students;
  const base = { class_id: classId, term_id: termId, student_id: studentId || undefined };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <Link
          href={reportsUrl("/admin/academics/reports", { class_id: classId, term_id: termId })}
          className="inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-brand-green"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          Report cards
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href={reportsUrl("/admin/academics/reports/print", { ...base, positions: showPositions ? "0" : undefined })}
            className="text-sm font-semibold text-brand-green-700 hover:underline"
          >
            {showPositions ? "Hide positions" : "Show positions"}
          </Link>
          <PrintButton label={students.length > 1 ? `Print ${students.length} report cards` : "Print report card"} />
        </div>
      </div>
      {!report.publication ? (
        <Alert tone="warning" className="print:hidden">
          These report cards are not published yet, so parents can&apos;t see them online.
        </Alert>
      ) : null}
      {students.length ? (
        <div className="space-y-6 print:space-y-0">
          {students.map((r) => (
            <ReportCard key={r.student.id} report={report} student={r} showPositions={showPositions} />
          ))}
        </div>
      ) : (
        <Alert tone="info">No pupils to show.</Alert>
      )}
    </div>
  );
}
