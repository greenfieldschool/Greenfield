import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { gradeRemark } from "@/lib/results";
import { loadPublishedReport, publishedViewer, readPublishedKey } from "@/lib/published-results";

// A published class result as a CSV for Excel: one row per pupil, ranked on the final score.
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) return new NextResponse("Database is not configured", { status: 503 });

  const key = readPublishedKey(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!key) return new NextResponse("Choose a published class result", { status: 400 });
  const { access, scope } = await publishedViewer(supabase);
  if (!access.userId) return new NextResponse("Please sign in", { status: 401 });
  if (scope.kind === "none") return new NextResponse("Published results are for school management, front desk and class teachers", { status: 403 });

  const result = await loadPublishedReport(supabase, key, scope);
  if (result.kind === "error") return new NextResponse(result.message, { status: 500 });
  if (result.kind !== "ok") return new NextResponse("These results aren't available", { status: 404 });
  const { report } = result;

  const cell = (v: unknown) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const rows = [...report.students].sort(
    (a, b) => (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) || a.student.last_name.localeCompare(b.student.last_name)
  );
  const lines = [
    [
      "Position",
      "Admission no",
      "Pupil name",
      ...report.subjects.map((s) => `${s.name} (/100)`),
      "Academic average (/100)",
      "Welfare (/100)",
      "Final score (/100)",
      "Grade",
      "Remark"
    ],
    ...rows.map((r) => {
      const bySubject = new Map(r.subjects.map((x) => [x.subjectId, x.percent] as const));
      return [
        r.position ?? "",
        r.student.admission_number ?? "",
        [r.student.last_name, r.student.first_name, r.student.middle_name].filter(Boolean).join(" "),
        ...report.subjects.map((s) => bySubject.get(s.id) ?? ""),
        r.academicAverage ?? "",
        r.welfare.percent ?? "",
        r.termTotal ?? "",
        r.termGrade ?? "",
        gradeRemark(r.termGrade, report.grades) ?? ""
      ];
    })
  ].map((row) => row.map(cell).join(","));

  const name = [report.cls.name, report.year?.name?.replace(/\//g, "-"), report.term.name, "results"]
    .filter(Boolean)
    .join(" - ")
    .replace(/[^\w\- ]+/g, "")
    .trim();
  // BOM so Excel opens it as UTF-8.
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name || "published-results"}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
