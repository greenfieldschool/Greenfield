import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function PortalHomePage() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user }
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">Portal</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Welcome</h1>
      <p className="mt-2 text-sm text-slate-600">
        View your students, activities, attendance, and school updates.
      </p>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">Signed in as</div>
        <div className="mt-1">{user?.email ?? "Unknown"}</div>
      </div>
    </div>
  );
}
