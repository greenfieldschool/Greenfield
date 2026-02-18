import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AdminHomePage() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user }
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  if (!user) {
    redirect("/admin/login?redirectTo=/admin");
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">Admin dashboard</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Overview</h1>
      <p className="mt-2 text-sm text-slate-600">
        Manage students, activities, guardians, attendance, incidents, admissions, and lifecycle.
      </p>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">Signed in as</div>
        <div className="mt-1">{user?.email ?? "Unknown"}</div>
      </div>
    </div>
  );
}
