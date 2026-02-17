import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SessionRow = {
  id: string;
  test_id: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  exam_tests: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; level: string; name: string }>;
};

type ConductorLinkRow = { conductor_id: string };

type SessionConductorRow = {
  session_id: string;
  exam_test_sessions: Array<SessionRow>;
};

export default async function ConductorSessionsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: linkData } = await supabase
    .from("exam_conductor_user_links")
    .select("conductor_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const link = (linkData ?? null) as ConductorLinkRow | null;
  if (!link) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Conductor</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">No conductor profile linked</h1>
        <p className="mt-2 text-sm text-slate-600">Ask an admin to link your user account to a conductor.</p>
      </div>
    );
  }

  const { data } = await supabase
    .from("exam_session_conductors")
    .select(
      "session_id, exam_test_sessions(id, test_id, starts_at, ends_at, status, exam_tests(id, name), classes(id, level, name))"
    )
    .eq("conductor_id", link.conductor_id)
    .order("created_at", { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as SessionConductorRow[];
  const sessions = rows.map((r) => (r.exam_test_sessions ?? [])[0]).filter(Boolean) as SessionRow[];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Conductor</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">My sessions</h1>
        <p className="mt-2 text-sm text-slate-600">Sessions you are assigned to conduct.</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-6">Test</div>
          <div className="col-span-4">Class</div>
          <div className="col-span-2">Status</div>
        </div>
        <div>
          {sessions.length ? (
            sessions.map((s) => {
              const test = (s.exam_tests ?? [])[0] ?? null;
              const cls = (s.classes ?? [])[0] ?? null;
              return (
                <Link
                  key={s.id}
                  href={`/conductor/sessions/${s.id}`}
                  className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <div className="col-span-6 font-semibold text-slate-900">{test?.name ?? s.test_id}</div>
                  <div className="col-span-4">{cls ? `${cls.level} - ${cls.name}` : "—"}</div>
                  <div className="col-span-2 text-xs font-semibold text-slate-700">{s.status}</div>
                </Link>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No sessions assigned yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
