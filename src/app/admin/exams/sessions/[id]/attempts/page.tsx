import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type AttemptRow = {
  attempt_id: string;
  session_id: string;
  student_id: string;
  admission_number: string | null;
  first_name: string;
  last_name: string;
  obtained_marks: number;
  max_marks: number;
  percent: number;
  status: string;
  locked_at: string | null;
  lock_count: number;
  started_at: string;
  submitted_at: string | null;
};

type SessionReleaseRow = {
  id: string;
  results_released_at: string | null;
};

export default async function AdminExamSessionAttemptsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: releaseData } = await supabase
    .from("exam_test_sessions")
    .select("id, results_released_at")
    .eq("id", id)
    .maybeSingle();

  const release = (releaseData ?? null) as SessionReleaseRow | null;

  const { data: attemptsData } = await supabase
    .from("exam_attempt_list_v")
    .select(
      "attempt_id, session_id, student_id, admission_number, first_name, last_name, obtained_marks, max_marks, percent, status, locked_at, lock_count, started_at, submitted_at"
    )
    .eq("session_id", id)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const attempts = (attemptsData ?? []) as AttemptRow[];

  async function releaseResults(formData: FormData) {
    "use server";

    const note = String(formData.get("note") ?? "").trim();

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    await supabase
      .from("exam_test_sessions")
      .update({
        results_released_at: new Date().toISOString(),
        results_released_by: user?.id ?? null,
        results_release_note: note.length ? note : null
      })
      .eq("id", id);

    revalidatePath(`/admin/exams/sessions/${id}/attempts`);
    revalidatePath("/portal/exams");
  }

  async function unreleaseResults() {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("exam_test_sessions")
      .update({ results_released_at: null, results_released_by: null, results_release_note: null })
      .eq("id", id);

    revalidatePath(`/admin/exams/sessions/${id}/attempts`);
    revalidatePath("/portal/exams");
  }

  async function updateMarks(formData: FormData) {
    "use server";

    const attemptId = String(formData.get("attempt_id") ?? "").trim();
    const obtained = Number(String(formData.get("obtained_marks") ?? "0").trim() || "0");
    const max = Number(String(formData.get("max_marks") ?? "0").trim() || "0");

    if (!attemptId) return;
    if (!Number.isFinite(obtained) || obtained < 0) return;
    if (!Number.isFinite(max) || max < 0) return;

    const percent = max > 0 ? (obtained / max) * 100 : 0;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("exam_attempts")
      .update({ obtained_marks: obtained, max_marks: max, percent, status: "graded", graded_at: new Date().toISOString() })
      .eq("id", attemptId);

    revalidatePath(`/admin/exams/sessions/${id}/attempts`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Session attempts</h1>
        <p className="mt-2 text-sm text-slate-600">Review who attempted and edit marks if needed.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/exams/sessions">
            Back to sessions
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-900">Result release</div>
            <p className="mt-2 text-sm text-slate-600">
              Students can only view correct answers/explanations after results are released.
            </p>
            <div className="mt-2 text-xs font-semibold text-slate-700">
              Status: {release?.results_released_at ? `Released (${release.results_released_at})` : "Not released"}
            </div>
          </div>

          {release?.results_released_at ? (
            <form action={unreleaseResults}>
              <button
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                type="submit"
              >
                Unrelease
              </button>
            </form>
          ) : (
            <form action={releaseResults} className="grid w-full gap-3 sm:max-w-md">
              <input
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="note"
                placeholder="(optional release note)"
              />
              <button
                className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
                type="submit"
              >
                Release results
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-3">Student</div>
          <div className="col-span-1">Adm no</div>
          <div className="col-span-2">Obtained</div>
          <div className="col-span-2">Max</div>
          <div className="col-span-1">%</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Action</div>
        </div>
        <div>
          {attempts.length ? (
            attempts.map((a) => (
              <div key={a.attempt_id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-3 font-semibold text-slate-900">
                  {a.first_name} {a.last_name}
                </div>
                <div className="col-span-2 text-slate-700">{a.admission_number ?? "—"}</div>
                <div className="col-span-7">
                  <form action={updateMarks} className="grid grid-cols-12 gap-3">
                    <input type="hidden" name="attempt_id" value={a.attempt_id} />
                    <div className="col-span-3">
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                        name="obtained_marks"
                        type="number"
                        step="0.01"
                        min={0}
                        defaultValue={String(a.obtained_marks ?? 0)}
                      />
                    </div>
                    <div className="col-span-3">
                      <input
                        className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                        name="max_marks"
                        type="number"
                        step="0.01"
                        min={0}
                        defaultValue={String(a.max_marks ?? 0)}
                      />
                    </div>
                    <div className="col-span-2 flex items-center text-slate-700">{Number(a.percent ?? 0).toFixed(2)}</div>
                    <div className="col-span-2 flex items-center text-xs font-semibold text-slate-700">
                      {a.status}
                      {a.locked_at ? ` • locked(${a.lock_count ?? 0})` : ""}
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
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No attempts yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
