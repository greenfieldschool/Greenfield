import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SessionRow = {
  id: string;
  test_id: string;
  starts_at: string | null;
  ends_at: string | null;
  status: string;
  requires_secret_code: boolean;
  exam_tests: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; level: string; name: string }>;
};

export default async function PortalExamsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("exam_test_sessions")
    .select("id, test_id, starts_at, ends_at, status, requires_secret_code, exam_tests(id, name), classes(id, level, name)")
    .order("starts_at", { ascending: false })
    .limit(50);

  const sessions = (data ?? []) as unknown as SessionRow[];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Exams</h1>
        <p className="mt-2 text-sm text-slate-600">Available exam sessions.</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-6">Test</div>
          <div className="col-span-4">Class</div>
          <div className="col-span-2">Action</div>
        </div>
        <div>
          {sessions.length ? (
            sessions.map((s) => {
              const test = (s.exam_tests ?? [])[0] ?? null;
              const cls = (s.classes ?? [])[0] ?? null;
              return (
                <div key={s.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                  <div className="col-span-6">
                    <div className="font-semibold text-slate-900">{test?.name ?? s.test_id}</div>
                    <div className="mt-1 text-xs text-slate-600">
                      {s.starts_at || s.ends_at
                        ? `${s.starts_at ? String(s.starts_at).slice(0, 16) : "—"} → ${s.ends_at ? String(s.ends_at).slice(0, 16) : "—"}`
                        : "—"}
                      {s.requires_secret_code ? " • code required" : ""}
                    </div>
                  </div>
                  <div className="col-span-4 text-slate-700">{cls ? `${cls.level} - ${cls.name}` : "—"}</div>
                  <div className="col-span-2">
                    <Link
                      href={`/portal/exams/${s.id}`}
                      className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-xs font-semibold text-white hover:brightness-95"
                    >
                      Open
                    </Link>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No exam sessions available.</div>
          )}
        </div>
      </div>
    </div>
  );
}
