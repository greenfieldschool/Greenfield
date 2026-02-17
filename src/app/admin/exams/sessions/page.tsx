import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type TestRow = { id: string; name: string };
type ClassRow = { id: string; level: string; name: string };
type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type SessionRow = {
  id: string;
  test_id: string;
  class_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  requires_secret_code: boolean;
  active: boolean;
  exam_tests: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; level: string; name: string }>;
};

export default async function AdminExamSessionsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: tests }, { data: classes }, { data: years }, { data: terms }, { data: sessions }] =
    await Promise.all([
      supabase.from("exam_tests").select("id, name").eq("active", true).order("created_at", { ascending: false }),
      supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
      supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
      supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false }),
      supabase
        .from("exam_test_sessions")
        .select(
          "id, test_id, class_id, starts_at, ends_at, status, requires_secret_code, active, exam_tests(id, name), classes(id, level, name)"
        )
        .order("created_at", { ascending: false })
        .limit(200)
    ]);

  const testRows = (tests ?? []) as TestRow[];
  const classRows = (classes ?? []) as ClassRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const sessionRows = (sessions ?? []) as unknown as SessionRow[];

  async function createSession(formData: FormData) {
    "use server";

    const testId = String(formData.get("test_id") ?? "").trim();
    const classIdRaw = String(formData.get("class_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const startsAt = String(formData.get("starts_at") ?? "").trim();
    const endsAt = String(formData.get("ends_at") ?? "").trim();
    const status = String(formData.get("status") ?? "draft").trim() || "draft";
    const requiresSecretCode = String(formData.get("requires_secret_code") ?? "").trim() === "on";
    const secretCode = String(formData.get("secret_code") ?? "").trim();

    if (!testId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("exam_test_sessions").insert({
      test_id: testId,
      class_id: classIdRaw.length ? classIdRaw : null,
      academic_year_id: yearIdRaw.length ? yearIdRaw : null,
      academic_term_id: termIdRaw.length ? termIdRaw : null,
      starts_at: startsAt.length ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt.length ? new Date(endsAt).toISOString() : null,
      status,
      requires_secret_code: requiresSecretCode,
      secret_code: requiresSecretCode && secretCode.length ? secretCode : null
    });

    revalidatePath("/admin/exams/sessions");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Sessions</h1>
        <p className="mt-2 text-sm text-slate-600">Schedule test sessions for classes and validity windows.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/exams">
            Back to exams
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">New session</h2>
        <form action={createSession} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Test</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="test_id"
              defaultValue=""
              required
            >
              <option value="">Select test</option>
              {testRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Class (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="class_id"
              defaultValue=""
            >
              <option value="">—</option>
              {classRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level} - {c.name}
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
            <label className="text-sm font-semibold text-slate-900">Starts at (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="starts_at"
              type="datetime-local"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Ends at (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="ends_at"
              type="datetime-local"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Status</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="status"
              defaultValue="draft"
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="closed">closed</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Secret code (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="secret_code"
              placeholder="Only if required"
            />
            <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input className="h-4 w-4" name="requires_secret_code" type="checkbox" />
              Require secret code to start
            </label>
          </div>
          <div className="flex items-end sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create session
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-5">Test</div>
          <div className="col-span-3">Class</div>
          <div className="col-span-2">Window</div>
          <div className="col-span-2">Actions</div>
        </div>
        <div>
          {sessionRows.length ? (
            sessionRows.map((s) => {
              const test = (s.exam_tests ?? [])[0] ?? null;
              const cls = (s.classes ?? [])[0] ?? null;
              const windowLabel =
                s.starts_at || s.ends_at
                  ? `${s.starts_at ? String(s.starts_at).slice(0, 16) : "—"} → ${s.ends_at ? String(s.ends_at).slice(0, 16) : "—"}`
                  : "—";
              return (
                <div
                  key={s.id}
                  className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700"
                >
                  <div className="col-span-5 font-semibold text-slate-900">{test?.name ?? s.test_id}</div>
                  <div className="col-span-3">{cls ? `${cls.level} - ${cls.name}` : "—"}</div>
                  <div className="col-span-2 text-xs text-slate-600">{windowLabel}</div>
                  <div className="col-span-2 flex flex-col gap-1">
                    <div className="text-[11px] font-semibold text-slate-700">
                      {s.status}
                      {s.requires_secret_code ? " • code" : ""}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link className="text-xs font-semibold text-brand-green hover:underline" href={`/admin/exams/sessions/${s.id}/attempts`}>
                        Attempts
                      </Link>
                      <Link
                        className="text-xs font-semibold text-brand-green hover:underline"
                        href={`/admin/exams/sessions/${s.id}/conductors`}
                      >
                        Conductors
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No sessions yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
