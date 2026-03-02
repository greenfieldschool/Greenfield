import { getSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import StaffPhotoUploader from "./StaffPhotoUploader";

export default async function AdminProfilePage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const userId = user?.id ?? null;

  const { data: profileData } = userId
    ? await supabase.from("profiles").select("role, full_name, email, profile_photo_url").eq("id", userId).maybeSingle()
    : { data: null as { role?: string | null; full_name?: string | null; email?: string | null; profile_photo_url?: string | null } | null };

  const role = (profileData?.role ?? null) as string | null;
  const profilePhotoUrl = (profileData?.profile_photo_url ?? null) as string | null;
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

  async function saveProfilePhoto(formData: FormData) {
    "use server";

    const photoUrlRaw = String(formData.get("profile_photo_url") ?? "").trim();
    const nextUrl = photoUrlRaw.length ? photoUrlRaw : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("profiles").update({ profile_photo_url: nextUrl }).eq("id", user.id);

    revalidatePath("/admin/profile");
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">{roleLabel}</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Profile</h1>
      <div className="mt-4 text-sm text-slate-700">Manage your staff profile details.</div>

      {userId ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-base font-semibold text-slate-900">Profile photo</h2>
          <p className="mt-1 text-sm text-slate-600">Drag & drop or upload a photo for your staff profile.</p>
          <div className="mt-4">
            <StaffPhotoUploader userId={userId} initialUrl={profilePhotoUrl} saveAction={saveProfilePhoto} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
