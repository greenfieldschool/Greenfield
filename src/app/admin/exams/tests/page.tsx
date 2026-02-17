import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
  }

  return (
    <div className="space-y-6">
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
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create test
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-6">Test</div>
          <div className="col-span-3">Subject</div>
          <div className="col-span-2">Duration</div>
          <div className="col-span-1">Status</div>
        </div>
        <div>
          {tests.length ? (
            tests.map((t) => (
              <Link
                key={t.id}
                href={`/admin/exams/tests/${t.id}`}
                className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                <div className="col-span-6 font-semibold text-slate-900">{t.name}</div>
                <div className="col-span-3">{(t.subjects ?? [])[0]?.name ?? "—"}</div>
                <div className="col-span-2">{t.duration_minutes}m</div>
                <div className="col-span-1">{t.active ? "Active" : "Off"}</div>
              </Link>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No tests yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
