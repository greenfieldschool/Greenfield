import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";

type SubjectRow = { id: string; name: string };

type TestRow = {
  id: string;
  subject_id: string | null;
  name: string;
  description: string | null;
  duration_minutes: number;
  active: boolean;
  subjects: Array<{ id: string; name: string }>;
};

export default async function AdminExamTestsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: subjectsData }, { data: testsData }] = await Promise.all([
    supabase.from("subjects").select("id, name").eq("active", true).order("name"),
    supabase
      .from("exam_tests")
      .select("id, subject_id, name, description, duration_minutes, active, subjects(id, name)")
      .order("created_at", { ascending: false })
      .limit(200)
  ]);

  const subjects = (subjectsData ?? []) as SubjectRow[];
  const tests = (testsData ?? []) as unknown as TestRow[];

  async function createTest(formData: FormData) {
    "use server";

    const subjectIdRaw = String(formData.get("subject_id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const durationMinutes = Number(String(formData.get("duration_minutes") ?? "60").trim() || "60");
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!name) return;
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("exam_tests").insert({
      subject_id: subjectIdRaw.length ? subjectIdRaw : null,
      name,
      description: description.length ? description : null,
      duration_minutes: durationMinutes,
      active
    });

    revalidatePath("/admin/exams/tests");
    redirect(`/admin/exams/tests?toast=${encodeURIComponent("Test created")}&toast_type=success`);
  }

  async function duplicateTest(formData: FormData) {
    "use server";

    const testId = String(formData.get("test_id") ?? "").trim();
    if (!testId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    // 1. Fetch original test
    const { data: testData } = await supabase
      .from("exam_tests")
      .select("subject_id, name, description, duration_minutes")
      .eq("id", testId)
      .maybeSingle();

    if (!testData) return;

    // 2. Insert duplicated test
    const { data: newTest, error: testErr } = await supabase
      .from("exam_tests")
      .insert({
        subject_id: testData.subject_id,
        name: `${testData.name} (Copy)`,
        description: testData.description,
        duration_minutes: testData.duration_minutes,
        active: true
      })
      .select("id")
      .maybeSingle();

    if (testErr || !newTest) return;

    // 3. Fetch questions
    const { data: questions } = await supabase
      .from("exam_questions")
      .select("id, question_type, prompt, marks, options")
      .eq("test_id", testId);

    if (questions && questions.length > 0) {
      for (const q of questions) {
        const { data: newQ } = await supabase
          .from("exam_questions")
          .insert({
            test_id: newTest.id,
            question_type: q.question_type,
            prompt: q.prompt,
            marks: q.marks,
            options: q.options
          })
          .select("id")
          .maybeSingle();

        if (newQ) {
          const { data: sol } = await supabase
            .from("exam_question_solutions")
            .select("correct_answer, explanation")
            .eq("question_id", q.id)
            .maybeSingle();

          if (sol) {
            await supabase.from("exam_question_solutions").insert({
              question_id: newQ.id,
              correct_answer: sol.correct_answer,
              explanation: sol.explanation
            });
          }
        }
      }
    }

    revalidatePath("/admin/exams/tests");
    redirect(`/admin/exams/tests?toast=${encodeURIComponent("Test duplicated successfully")}&toast_type=success`);
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Tests</h1>
        <p className="mt-2 text-sm text-slate-600">Create tests and then add questions.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/exams">
            Back to exams
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">New test</h2>
        <form action={createTest} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Subject (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="subject_id"
              defaultValue=""
            >
              <option value="">—</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Duration (minutes)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="duration_minutes"
              type="number"
              min={1}
              defaultValue={60}
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Test name</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="name"
              placeholder="Mid-term examination"
              required
            />
          </div>
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Description</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="description"
              placeholder="(optional)"
            />
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input className="h-4 w-4" name="active" type="checkbox" defaultChecked />
              Active
            </label>
          </div>

          <div className="flex items-end sm:col-span-2">
            <SubmitButton
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              pendingText="Creating…"
            >
              Create test
            </SubmitButton>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-5">Test</div>
          <div className="col-span-3">Subject</div>
          <div className="col-span-2">Duration</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>
        <div className="divide-y divide-slate-200">
          {tests.length ? (
            tests.map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-12 gap-0 px-6 py-4 text-sm text-slate-700 hover:bg-slate-50/50 items-center"
              >
                <div className="col-span-5 font-semibold text-slate-900">
                  <Link href={`/admin/exams/tests/${t.id}`} className="hover:text-brand-green hover:underline">
                    {t.name}
                  </Link>
                </div>
                <div className="col-span-3">{(t.subjects ?? [])[0]?.name ?? "—"}</div>
                <div className="col-span-2">{t.duration_minutes}m</div>
                <div className="col-span-1">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${t.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                    {t.active ? "Active" : "Inactive"}
                  </span>
                </div>
                <div className="col-span-1 flex items-center justify-end gap-2">
                  <form action={duplicateTest}>
                    <input type="hidden" name="test_id" value={t.id} />
                    <button
                      type="submit"
                      title="Duplicate entire test and questions"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 active:scale-95 transition-all shadow-sm"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" />
                      </svg>
                    </button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No tests yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
