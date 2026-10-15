import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetch-all";

type ClassRow = { id: string; level: string; name: string; active: boolean };
type StudentRow = { class_id: string | null; status: string };

const levelOrder: Record<string, number> = { creche: 0, primary: 1, secondary: 2 };
const currentStatuses = new Set(["active", "enrolled"]);

export default async function AdminClassesPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: classData }, students] = await Promise.all([
    supabase.from("classes").select("id, level, name, active").order("level").order("name"),
    fetchAllRows<StudentRow>(() => supabase.from("students").select("class_id, status").order("id"))
  ]);

  const classes = ((classData ?? []) as ClassRow[]).sort(
    (a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9) || a.name.localeCompare(b.name)
  );

  const counts = new Map<string, { current: number; total: number }>();
  let unassigned = 0;
  for (const s of students) {
    if (!s.class_id) {
      if (currentStatuses.has(s.status)) unassigned += 1;
      continue;
    }
    const c = counts.get(s.class_id) ?? { current: 0, total: 0 };
    c.total += 1;
    if (currentStatuses.has(s.status)) c.current += 1;
    counts.set(s.class_id, c);
  }

  const levels = Array.from(new Set(classes.map((c) => c.level)));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Core</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Classes</h1>
        <p className="mt-2 text-sm text-slate-600">
          Open a class to see the children in it and correct anything that was registered wrongly (name, admission
          number, class or status).
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link className="font-semibold text-brand-green hover:underline" href="/admin/finance/fees/classes">
            Add or deactivate classes
          </Link>
          {unassigned > 0 ? (
            <Link className="font-semibold text-amber-700 hover:underline" href="/admin/classes/unassigned">
              {unassigned} current student{unassigned === 1 ? " has" : "s have"} no class
            </Link>
          ) : null}
        </div>
      </div>

      {levels.map((level) => (
        <div key={level} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{level}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {classes
              .filter((c) => c.level === level)
              .map((c) => {
                const n = counts.get(c.id) ?? { current: 0, total: 0 };
                return (
                  <Link
                    key={c.id}
                    href={`/admin/classes/${c.id}`}
                    className={`rounded-2xl border bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-green/40 hover:shadow-md ${
                      c.active ? "border-slate-200" : "border-dashed border-slate-300 opacity-70"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-semibold text-slate-900">{c.name}</div>
                      {!c.active ? (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">Inactive</span>
                      ) : null}
                    </div>
                    <div className="mt-3 text-3xl font-bold text-slate-900">{n.current}</div>
                    <div className="text-xs text-slate-500">
                      current student{n.current === 1 ? "" : "s"}
                      {n.total > n.current ? ` · ${n.total - n.current} past/other` : ""}
                    </div>
                  </Link>
                );
              })}
          </div>
        </div>
      ))}

      {!classes.length ? (
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
          No classes yet. Create them under Finance → Fees → Classes.
        </div>
      ) : null}
    </div>
  );
}
