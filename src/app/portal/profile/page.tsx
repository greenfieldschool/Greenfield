import { getSupabaseServerClient } from "@/lib/supabase/server";

type GuardianRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  interests: string[];
};

export default async function PortalProfilePage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as string | null | undefined;

  if (role !== "parent") {
    return null;
  }

  const { data: guardianLink } = await supabase
    .from("guardian_user_links")
    .select("guardian_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const guardianId = (guardianLink?.guardian_id as string | undefined) ?? null;

  const { data: guardianData } = guardianId
    ? await supabase
        .from("guardians")
        .select("id, full_name, email, phone, profile_photo_url, interests")
        .eq("id", guardianId)
        .maybeSingle()
    : { data: null as unknown };

  const guardian = (guardianData ?? null) as GuardianRow | null;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">Portal</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">My profile</h1>
      <p className="mt-2 text-sm text-slate-600">Your parent/guardian profile (managed by school admin).</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {guardian?.profile_photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="h-full w-full object-cover" alt="" src={guardian.profile_photo_url} />
            ) : null}
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900">{guardian?.full_name ?? "—"}</div>
            <div className="mt-1 text-sm text-slate-600">{guardian?.email ?? user.email ?? "—"}</div>
            <div className="mt-1 text-sm text-slate-600">{guardian?.phone ?? "—"}</div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-xs font-semibold text-slate-500">Interests</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(guardian?.interests ?? []).length ? (
              (guardian?.interests ?? []).map((i) => (
                <span key={i} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                  {i}
                </span>
              ))
            ) : (
              <div className="text-sm text-slate-600">—</div>
            )}
          </div>
        </div>
      </div>

      {!guardianId ? (
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          No guardian record is linked to this account yet.
        </div>
      ) : null}
    </div>
  );
}
