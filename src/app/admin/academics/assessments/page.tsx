import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };
type ClassRow = { id: string; level: string; name: string };
type SubjectRow = { id: string; name: string };

type AssessmentRow = {
  id: string;
  assessment_type: string;
  title: string | null;
  held_on: string | null;
  max_score: number;
  subjects: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; level: string; name: string }>;
  academic_years: Array<{ id: string; name: string }>;
  academic_terms: Array<{ id: string; name: string }>;
};

const assessmentTypes = ["weekly_test", "mid_term", "exam", "mock", "assignment"] as const;

export default async function AdminAssessmentsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: years }, { data: terms }, { data: classes }, { data: subjects }, { data: assessments }] =
    await Promise.all([
      supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
      supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false }),
      supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
      supabase.from("subjects").select("id, name").eq("active", true).order("name"),
      supabase
        .from("academic_assessments")
        .select(
          "id, assessment_type, title, held_on, max_score, subjects(id, name), classes(id, level, name), academic_years(id, name), academic_terms(id, name)"
        )
        .order("held_on", { ascending: false })
        .limit(200)
    ]);

  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const classRows = (classes ?? []) as ClassRow[];
  const subjectRows = (subjects ?? []) as SubjectRow[];
  const assessmentRows = (assessments ?? []) as unknown as AssessmentRow[];

  async function createAssessment(formData: FormData) {
    "use server";

    const academicYearId = String(formData.get("academic_year_id") ?? "").trim();
    const academicTermId = String(formData.get("academic_term_id") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();
    const subjectId = String(formData.get("subject_id") ?? "").trim();
    const assessmentType = String(formData.get("assessment_type") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const maxScore = Number(String(formData.get("max_score") ?? "100").trim() || "100");
    const heldOn = String(formData.get("held_on") ?? "").trim();

    if (!classId || !subjectId || !assessmentType) return;
    if (!Number.isFinite(maxScore) || maxScore <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("academic_assessments").insert({
      academic_year_id: academicYearId.length ? academicYearId : null,
      academic_term_id: academicTermId.length ? academicTermId : null,
      class_id: classId,
      subject_id: subjectId,
      assessment_type: assessmentType,
      title: title.length ? title : null,
      max_score: maxScore,
      held_on: heldOn.length ? heldOn : null
    });

    revalidatePath("/admin/academics/assessments");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Academics</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Assessments</h1>
        <p className="mt-2 text-sm text-slate-600">Create assessments and enter scores.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">New assessment</h2>
        <form action={createAssessment} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Class</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="class_id"
              defaultValue=""
              required
            >
              <option value="">Select class</option>
              {classRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level} - {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Subject</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="subject_id"
              defaultValue=""
              required
            >
              <option value="">Select subject</option>
              {subjectRows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Academic year (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_year_id"
              defaultValue=""
            >
              <option value="">—</option>
              {yearRows.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Academic term (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_term_id"
              defaultValue=""
            >
              <option value="">—</option>
              {termRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Type</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="assessment_type"
              defaultValue={assessmentTypes[0]}
            >
              {assessmentTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Held on (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="held_on"
              type="date"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Title (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="title"
              placeholder="Mid-term test"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Max score</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="max_score"
              type="number"
              step="0.01"
              defaultValue="100"
              required
            />
          </div>

          <div className="flex items-end sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create assessment
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-5">Assessment</div>
          <div className="col-span-4">Class / Subject</div>
          <div className="col-span-3">Held on</div>
        </div>
        <div>
          {assessmentRows.length ? (
            assessmentRows.map((a) => {
              const cls = (a.classes ?? [])[0] ?? null;
              const subj = (a.subjects ?? [])[0] ?? null;
              return (
                <Link
                  key={a.id}
                  href={`/admin/academics/assessments/${a.id}`}
                  className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <div className="col-span-5">
                    <div className="font-semibold text-slate-900">{a.title ?? a.assessment_type}</div>
                    <div className="mt-1 text-xs text-slate-600">{a.assessment_type}</div>
                  </div>
                  <div className="col-span-4">
                    <div className="font-semibold text-slate-900">{cls ? `${cls.level} - ${cls.name}` : "—"}</div>
                    <div className="mt-1 text-xs text-slate-600">{subj?.name ?? "—"}</div>
                  </div>
                  <div className="col-span-3">{a.held_on ?? "—"}</div>
                </Link>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No assessments yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
