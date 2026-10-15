import { revalidatePath } from "next/cache";
import { notFound, redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { firstOrNull } from "@/lib/relations";
import { CalendarDays, ClipboardCheck, Tag, Target, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type AssessmentRow = {
  id: string;
  class_id: string | null;
  subject_id: string;
  assessment_type: string;
  title: string | null;
  max_score: number;
  held_on: string | null;
  subjects: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; level: string; name: string }>;
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
};

type ScoreRow = {
  id: string;
  student_id: string;
  score: number;
  remarks: string | null;
};

export default async function AdminAssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: assessmentData } = await supabase
    .from("academic_assessments")
    .select("id, class_id, subject_id, assessment_type, title, max_score, held_on, subjects(id, name), classes(id, level, name)")
    .eq("id", id)
    .maybeSingle();

  const assessment = (assessmentData ?? null) as unknown as AssessmentRow | null;
  if (!assessment) notFound();

  const classId = assessment.class_id;

  const [{ data: studentsData }, { data: scoresData }] = await Promise.all([
    classId
      ? supabase
          .from("students")
          .select("id, first_name, last_name, class_id")
          .eq("class_id", classId)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true })
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from("academic_assessment_scores")
      .select("id, student_id, score, remarks")
      .eq("assessment_id", id)
  ]);

  const students = (studentsData ?? []) as StudentRow[];
  const scores = (scoresData ?? []) as ScoreRow[];
  const scoreByStudentId = new Map(scores.map((s) => [s.student_id, s] as const));

  const cls = firstOrNull(assessment.classes);
  const subj = firstOrNull(assessment.subjects);

  async function upsertScore(formData: FormData) {
    "use server";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const scoreRaw = String(formData.get("score") ?? "").trim();
    const remarks = String(formData.get("remarks") ?? "").trim();
    const score = Number(scoreRaw || "0");

    const base = `/admin/academics/assessments/${id}`;
    if (!studentId) redirect(`${base}?toast=${encodeURIComponent("Missing student")}&toast_type=error`);
    if (!Number.isFinite(score) || score < 0) {
      redirect(`${base}?toast=${encodeURIComponent("Enter a score of 0 or more")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(`${base}?toast=${encodeURIComponent("Database is not configured")}&toast_type=error`);

    const { error } = await supabase.from("academic_assessment_scores").upsert(
      {
        assessment_id: id,
        student_id: studentId,
        score,
        remarks: remarks.length ? remarks : null
      },
      { onConflict: "assessment_id,student_id" }
    );

    revalidatePath(base);
    if (error) redirect(`${base}?toast=${encodeURIComponent(error.message)}&toast_type=error`);
    redirect(`${base}?toast=${encodeURIComponent("Score saved")}&toast_type=success`);
  }

  const scoredCount = students.filter((st) => scoreByStudentId.has(st.id)).length;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/academics/assessments", label: "Back to assessments" }}
        eyebrow="Academics"
        title="Assessment scores"
        description={`${subj?.name ?? "Subject"} — ${assessment.title ?? assessment.assessment_type} (${
          cls ? `${cls.level} - ${cls.name}` : "No class"
        })`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Max score" value={assessment.max_score} icon={Target} tone="blue" />
        <StatCard label="Held on" value={assessment.held_on ?? "—"} icon={CalendarDays} tone="slate" />
        <StatCard
          label="Scores entered"
          value={`${scoredCount}/${students.length}`}
          hint="Students with a saved score"
          icon={ClipboardCheck}
          tone="green"
        />
        <StatCard
          label="Type"
          value={<span className="text-lg">{assessment.assessment_type}</span>}
          icon={Tag}
          tone="violet"
        />
      </div>

      <Card>
        <CardHeader title="Scores" description="Enter a score and optional remark, then save each row." />
        {students.length ? (
          <div className="max-h-[75vh] overflow-auto">
            <table className="w-full min-w-[620px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="sticky left-0 top-0 z-30 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 sm:pl-6"
                  >
                    Student
                  </th>
                  <th
                    scope="col"
                    className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-left text-xs font-semibold text-slate-600 sm:pr-6"
                  >
                    Score <span className="font-normal text-slate-400">out of {assessment.max_score}</span>
                    <span className="mx-2 text-slate-300">·</span>
                    Remarks
                  </th>
                </tr>
              </thead>
              <tbody>
                {students.map((st) => {
                  const existing = scoreByStudentId.get(st.id) ?? null;
                  return (
                    <tr key={st.id} className="group">
                      <th
                        scope="row"
                        className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-2 text-left font-semibold text-slate-900 group-hover:bg-slate-50 sm:pl-6"
                      >
                        <div className="flex items-center gap-2">
                          <span>
                            {st.first_name} {st.last_name}
                          </span>
                          {existing ? (
                            <Badge tone="green" className="hidden sm:inline-flex">
                              Saved
                            </Badge>
                          ) : null}
                        </div>
                      </th>
                      <td className="border-b border-slate-100 px-4 py-2 group-hover:bg-slate-50 sm:pr-6">
                        <form action={upsertScore} className="flex items-center gap-2">
                          <input type="hidden" name="student_id" value={st.id} />
                          <input
                            className="h-9 w-20 shrink-0 rounded-lg border border-slate-300 bg-white px-2 text-center text-sm tabular-nums text-slate-900 shadow-sm outline-none transition focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15 invalid:border-red-400 invalid:bg-red-50"
                            name="score"
                            type="number"
                            inputMode="decimal"
                            step="0.01"
                            min="0"
                            max={String(assessment.max_score)}
                            defaultValue={existing ? String(existing.score) : ""}
                            placeholder={String(assessment.max_score)}
                            aria-label={`Score for ${st.first_name} ${st.last_name}`}
                          />
                          <input
                            className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15"
                            name="remarks"
                            defaultValue={existing?.remarks ?? ""}
                            placeholder="Remarks (optional)"
                            aria-label={`Remarks for ${st.first_name} ${st.last_name}`}
                          />
                          <SubmitButton variant="primary" size="sm" pendingText="Saving…">
                            Save
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title="No students found" description="No students found for this class." />
        )}
      </Card>
    </div>
  );
}
