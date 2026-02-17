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

export default async function ConductorSessionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: attemptsData } = await supabase
    .from("exam_attempt_list_v")
    .select(
      "attempt_id, session_id, student_id, admission_number, first_name, last_name, obtained_marks, max_marks, percent, status, locked_at, lock_count, started_at, submitted_at"
    )
    .eq("session_id", id)
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const attempts = (attemptsData ?? []) as AttemptRow[];

  async function unlockAttempt(formData: FormData) {
    "use server";

    const attemptId = String(formData.get("attempt_id") ?? "").trim();
    const note = String(formData.get("unlock_note") ?? "").trim();

    if (!attemptId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    await supabase
      .from("exam_attempts")
      .update({
        locked_at: null,
        locked_reason: null,
        unlocked_at: new Date().toISOString(),
        unlocked_by: user?.id ?? null,
        unlock_note: note.length ? note : null
      })
      .eq("id", attemptId);

    await supabase.from("exam_malpractice_events").insert({
      attempt_id: attemptId,
      event_type: "unlock",
      event_data: { unlock_note: note.length ? note : null }
    });

    revalidatePath(`/conductor/sessions/${id}`);
  }

  async function bulkUnlock(formData: FormData) {
    "use server";

    const note = String(formData.get("unlock_note") ?? "").trim();
    if (!note) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const { data: lockedAttempts } = await supabase
      .from("exam_attempts")
      .select("id")
      .eq("session_id", id)
      .not("locked_at", "is", null);

    const ids = (lockedAttempts ?? []).map((r) => (r as { id: string }).id).filter((v) => v.length);
    if (!ids.length) return;

    await supabase
      .from("exam_attempts")
      .update({
        locked_at: null,
        locked_reason: null,
        unlocked_at: new Date().toISOString(),
        unlocked_by: user?.id ?? null,
        unlock_note: note
      })
      .in("id", ids);

    await supabase
      .from("exam_malpractice_events")
      .insert(ids.map((attemptId) => ({ attempt_id: attemptId, event_type: "bulk_unlock", event_data: { note } })));

    revalidatePath(`/conductor/sessions/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Conductor</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Session</h1>
        <p className="mt-2 text-sm text-slate-600">Unlock students if their exam is locked.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/conductor/sessions"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-sm font-semibold text-slate-900">Bulk unlock (outage)</div>
        <p className="mt-1 text-sm text-slate-600">Unlock all locked attempts for this session. Note is required.</p>
        <form action={bulkUnlock} className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            className="w-full flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
            name="unlock_note"
            placeholder="e.g. Power outage"
            required
          />
          <button
            className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            type="submit"
          >
            Bulk unlock
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Student</div>
          <div className="col-span-2">Adm no</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-4">Action</div>
        </div>
        <div>
          {attempts.length ? (
            attempts.map((a) => (
              <div key={a.attempt_id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-4 font-semibold text-slate-900">
                  {a.first_name} {a.last_name}
                </div>
                <div className="col-span-2 text-slate-700">{a.admission_number ?? "—"}</div>
                <div className="col-span-2 text-xs font-semibold text-slate-700">
                  {a.status}
                  {a.locked_at ? ` • locked(${a.lock_count ?? 0})` : ""}
                </div>
                <div className="col-span-4">
                  {a.locked_at ? (
                    <form action={unlockAttempt} className="grid grid-cols-12 gap-2">
                      <input type="hidden" name="attempt_id" value={a.attempt_id} />
                      <input
                        className="col-span-8 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                        name="unlock_note"
                        placeholder="(optional note)"
                      />
                      <button
                        className="col-span-4 inline-flex items-center justify-center rounded-xl bg-brand-green px-3 py-2 text-xs font-semibold text-white hover:brightness-95"
                        type="submit"
                      >
                        Unlock
                      </button>
                    </form>
                  ) : (
                    <div className="text-sm text-slate-600">—</div>
                  )}
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
