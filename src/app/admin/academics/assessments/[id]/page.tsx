import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
  if (!assessment) return null;

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

  const cls = (assessment.classes ?? [])[0] ?? null;
  const subj = (assessment.subjects ?? [])[0] ?? null;

  async function upsertScore(formData: FormData) {
    "use server";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const scoreRaw = String(formData.get("score") ?? "").trim();
    const remarks = String(formData.get("remarks") ?? "").trim();
    const score = Number(scoreRaw || "0");

    if (!studentId) return;
    if (!Number.isFinite(score) || score < 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("academic_assessment_scores")
      .upsert(
        {
          assessment_id: id,
          student_id: studentId,
          score,
          remarks: remarks.length ? remarks : null
        },
        { onConflict: "assessment_id,student_id" }
      );

    revalidatePath(`/admin/academics/assessments/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Academics</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Assessment scores</h1>
        <p className="mt-2 text-sm text-slate-600">
          {subj?.name ?? "Subject"} — {assessment.title ?? assessment.assessment_type} ({cls ? `${cls.level} - ${cls.name}` : "No class"})
        </p>
        <div className="mt-4 flex gap-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/academics/assessments">
            Back to assessments
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Student</div>
          <div className="col-span-2">Score</div>
          <div className="col-span-6">Remarks</div>
        </div>
        <div>
          {students.length ? (
            students.map((st) => {
              const existing = scoreByStudentId.get(st.id) ?? null;
              return (
                <div key={st.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                  <div className="col-span-4 font-semibold text-slate-900">
                    {st.first_name} {st.last_name}
                  </div>
                  <div className="col-span-8">
                    <form action={upsertScore} className="grid grid-cols-12 gap-3">
                      <input type="hidden" name="student_id" value={st.id} />
                      <div className="col-span-3 sm:col-span-2">
                        <input
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                          name="score"
                          type="number"
                          step="0.01"
                          min="0"
                          max={String(assessment.max_score)}
                          defaultValue={existing ? String(existing.score) : ""}
                          placeholder={String(assessment.max_score)}
                        />
                      </div>
                      <div className="col-span-7 sm:col-span-8">
                        <input
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                          name="remarks"
                          defaultValue={existing?.remarks ?? ""}
                          placeholder="(optional)"
                        />
                      </div>
                      <div className="col-span-2">
                        <button
                          className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-3 py-2 text-xs font-semibold text-white hover:brightness-95"
                          type="submit"
                        >
                          Save
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No students found for this class.</div>
          )}
        </div>
      </div>
    </div>
  );
}
