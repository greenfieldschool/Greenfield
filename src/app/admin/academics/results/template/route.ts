import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canTeach, getTeacherAccess } from "@/lib/teacher-access";

// The result sheet as a CSV for Excel: Admission no, Pupil name, one column per assessment (with any scores
// already saved). Fill it in, copy the rows and paste them into "Bulk upload" on the result sheet.
export async function GET(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return new NextResponse("Database is not configured", { status: 503 });

  const q = request.nextUrl.searchParams;
  const classId = q.get("class_id") ?? "";
  const subjectId = q.get("subject_id") ?? "";
  const termId = q.get("term_id") ?? "";
  if (!classId || !subjectId || !termId) return new NextResponse("Choose a class, subject and term", { status: 400 });

  const access = await getTeacherAccess(supabase);
  if (!access.userId) return new NextResponse("Please sign in", { status: 401 });
  if (!canTeach(access, classId, subjectId)) return new NextResponse("You don't teach this subject in this class", { status: 403 });

  const [{ data: cls }, { data: subject }, { data: term }, { data: cols }, { data: pupils }] = await Promise.all([
    supabase.from("classes").select("name").eq("id", classId).maybeSingle(),
    supabase.from("subjects").select("name").eq("id", subjectId).maybeSingle(),
    supabase.from("academic_terms").select("name").eq("id", termId).maybeSingle(),
    supabase
      .from("academic_assessments")
      .select("id, title, max_score")
      .eq("class_id", classId)
      .eq("subject_id", subjectId)
      .eq("academic_term_id", termId)
      .eq("on_result_sheet", true)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("students")
      .select("id, first_name, last_name, admission_number")
      .eq("class_id", classId)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
  ]);
  const columns = (cols ?? []) as Array<{ id: string; title: string | null; max_score: number }>;
  const students = (pupils ?? []) as Array<{ id: string; first_name: string; last_name: string; admission_number: string | null }>;
  if (!columns.length) return new NextResponse("Open the result sheet first so its columns are set up", { status: 409 });

  const { data: scores } = await supabase
    .from("academic_assessment_scores")
    .select("assessment_id, student_id, score")
    .in(
      "assessment_id",
      columns.map((c) => c.id)
    );
  const scoreOf = new Map(((scores ?? []) as Array<{ assessment_id: string; student_id: string; score: number }>).map((s) => [`${s.assessment_id}:${s.student_id}`, s.score] as const));

  const cell = (v: unknown) => {
    const t = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lines = [
    ["Admission no", "Pupil name", ...columns.map((c) => `${c.title ?? "Score"} (/${Number(c.max_score)})`)],
    ...students.map((s) => [
      s.admission_number ?? "",
      `${s.last_name} ${s.first_name}`,
      ...columns.map((c) => scoreOf.get(`${c.id}:${s.id}`) ?? "")
    ])
  ].map((row) => row.map(cell).join(","));

  const name = [(cls as { name: string } | null)?.name, (subject as { name: string } | null)?.name, (term as { name: string } | null)?.name]
    .filter(Boolean)
    .join(" - ")
    .replace(/[^\w\- ]+/g, "")
    .trim();
  // BOM so Excel opens it as UTF-8.
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name || "result-sheet"}.csv"`,
      "Cache-Control": "no-store"
    }
  });
}
