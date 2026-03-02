import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string | null;
  level: string;
  class_id: string | null;
  status: string;
  date_of_birth: string | null;
};

export default async function AdminStudentsPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const [{ data }, { data: classesData }] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id, first_name, last_name, admission_number, level, class_id, status, date_of_birth"
      )
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase.from("classes").select("id, level, name, active").eq("active", true).order("level").order("name")
  ]);

  const students = (data ?? []) as unknown as StudentRow[];
  const classOptions = (classesData ?? []) as Array<{ id: string; level: string; name: string }>;
  const classById = new Map(classOptions.map((c) => [c.id, c] as const));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Admin</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Students</h1>
            <p className="mt-2 text-sm text-slate-600">
              Manage approved/enrolled students. To add a new student, create and approve a student application.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/students/applications/new"
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
            >
              New application
            </Link>
            <Link
              href="/admin/students/applications"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              View applications
            </Link>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-5">Name</div>
          <div className="col-span-2">Adm no</div>
          <div className="col-span-2">Level</div>
          <div className="col-span-2">Class</div>
          <div className="col-span-1">Status</div>
          <div className="col-span-0">DOB</div>
        </div>
        <div>
          {students.length ? (
            students.map((s) => (
              <Link
                key={s.id}
                href={`/admin/students/${s.id}`}
                className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700 hover:bg-slate-50"
              >
                <div className="col-span-5 font-semibold text-slate-900">
                  {s.first_name} {s.last_name}
                </div>
                <div className="col-span-2">{s.admission_number ?? "—"}</div>
                <div className="col-span-2">{s.level}</div>
                <div className="col-span-2">{(s.class_id ? classById.get(s.class_id)?.name : null) ?? "—"}</div>
                <div className="col-span-1">{s.status}</div>
                <div className="col-span-0">{s.date_of_birth ?? "—"}</div>
              </Link>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No students yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
