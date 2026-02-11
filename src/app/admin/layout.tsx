import Link from "next/link";
import type { ReactNode } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return <>{children}</>;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <>{children}</>;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as string | null | undefined;
  const isStaff =
    role === "super_admin" ||
    role === "admin" ||
    role === "teacher" ||
    role === "front_desk" ||
    role === "nurse";

  if (!isStaff) {
    return <>{children}</>;
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full lg:w-64">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold text-slate-500">Signed in</div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-900">{user.email}</div>

            <nav className="mt-5 space-y-1 text-sm">
              <Link className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50" href="/admin">
                Dashboard
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/admin/users"
              >
                Users
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/admin/students"
              >
                Students
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/admin/activities"
              >
                Activities
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/admin/guardians"
              >
                Guardians
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/admin/attendance"
              >
                Attendance
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/admin/incidents"
              >
                Incidents / Health
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/admin/applications"
              >
                Admissions
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/admin/careers"
              >
                Careers
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/admin/careers/applications"
              >
                Career applications
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/admin/audit"
              >
                Audit log
              </Link>
            </nav>

            <form className="mt-5" action="/admin/logout" method="post">
              <button
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
