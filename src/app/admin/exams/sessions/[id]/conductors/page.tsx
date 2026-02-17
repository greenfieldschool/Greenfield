import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ConductorRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
};

type AssignmentRow = { session_id: string; conductor_id: string };

type SessionSummaryRow = {
  session_id: string;
  test_name: string;
  class_level: string | null;
  class_name: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
};

export default async function AdminExamSessionConductorsPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: conductorsData }, { data: assignmentsData }, { data: summaryData }] = await Promise.all([
    supabase.from("exam_conductors").select("id, full_name, email, phone, active").order("full_name"),
    supabase
      .from("exam_session_conductors")
      .select("session_id, conductor_id")
      .eq("session_id", id),
    supabase
      .from("exam_session_summary_v")
      .select("session_id, test_name, class_level, class_name, status, starts_at, ends_at")
      .eq("session_id", id)
      .maybeSingle()
  ]);

  const conductors = (conductorsData ?? []) as ConductorRow[];
  const assignments = (assignmentsData ?? []) as AssignmentRow[];
  const summary = (summaryData ?? null) as SessionSummaryRow | null;

  const assignedSet = new Set(assignments.map((a) => a.conductor_id));

  async function updateAssignments(formData: FormData) {
    "use server";

    const selected = formData.getAll("conductor_id").map((v) => String(v).trim()).filter(Boolean);
    const selectedSet = new Set(selected);

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const { data: existing } = await supabase
      .from("exam_session_conductors")
      .select("conductor_id")
      .eq("session_id", id);

    const existingIds = (existing ?? []).map((r) => (r as { conductor_id: string }).conductor_id);
    const existingSet = new Set(existingIds);

    const toAdd = selected.filter((cid) => !existingSet.has(cid));
    const toRemove = existingIds.filter((cid) => !selectedSet.has(cid));

    if (toAdd.length) {
      await supabase.from("exam_session_conductors").insert(toAdd.map((cid) => ({ session_id: id, conductor_id: cid })));
    }

    if (toRemove.length) {
      await supabase.from("exam_session_conductors").delete().eq("session_id", id).in("conductor_id", toRemove);
    }

    revalidatePath(`/admin/exams/sessions/${id}/conductors`);
    revalidatePath(`/admin/exams/sessions/${id}/attempts`);
    revalidatePath("/conductor/sessions");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Assign conductors</h1>
        <p className="mt-2 text-sm text-slate-600">
          {summary
            ? `${summary.test_name} • ${summary.class_level ?? ""}${summary.class_name ? ` - ${summary.class_name}` : ""}`
            : "Session"}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            href="/admin/exams/sessions"
          >
            Back to sessions
          </Link>
          <Link
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            href={`/admin/exams/sessions/${id}/attempts`}
          >
            View attempts
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Conductors</h2>
        <p className="mt-2 text-sm text-slate-600">Only assigned conductors can unlock students in this session.</p>

        <form action={updateAssignments} className="mt-6 space-y-4">
          <div className="space-y-2">
            {conductors.length ? (
              conductors.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{c.full_name}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {c.email ?? "—"} {c.phone ? ` • ${c.phone}` : ""}
                    </div>
                  </div>
                  <input
                    className="h-5 w-5"
                    type="checkbox"
                    name="conductor_id"
                    value={c.id}
                    defaultChecked={assignedSet.has(c.id)}
                    disabled={!c.active}
                  />
                </label>
              ))
            ) : (
              <div className="text-sm text-slate-600">No conductors available yet. Create one first.</div>
            )}
          </div>

          <button
            className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            type="submit"
            disabled={!conductors.length}
          >
            Save assignments
          </button>
        </form>
      </div>
    </div>
  );
}
