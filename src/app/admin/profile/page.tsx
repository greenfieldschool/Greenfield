import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminProfilePage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: profileData } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null as { role?: string | null } | null };

  const role = (profileData?.role ?? null) as string | null;
  const roleLabel =
    role === "super_admin" || role === "admin"
      ? "Admin"
      : role === "teacher"
        ? "Teacher"
        : role === "front_desk"
          ? "Front desk"
          : role === "nurse"
            ? "Nurse"
            : "Staff";

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">{roleLabel}</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Profile</h1>
      <div className="mt-4 text-sm text-slate-700">Profile management will live here.</div>
    </div>
  );
}
