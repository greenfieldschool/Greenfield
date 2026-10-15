import { getSupabaseServerClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import StaffPhotoUploader from "./StaffPhotoUploader";
import UrlToast from "@/components/url-toast";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { FormSection } from "@/components/ui/form-section";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

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
    if (!supabase) redirect(profileToast("Server error — Supabase is not configured"));

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) redirect(profileToast("You must be logged in"));

    const { error } = await supabase.from("profiles").update({ profile_photo_url: nextUrl }).eq("id", user.id);
    if (error) redirect(profileToast(error.message));

    revalidatePath("/admin/profile");
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader eyebrow={roleLabel} title="Profile" description="Manage your staff profile details." />

      {userId ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardBody className="flex items-center gap-4">
              <Avatar name={profileData?.full_name ?? profileData?.email ?? "Staff"} src={profilePhotoUrl} size="lg" />
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">{profileData?.full_name ?? "—"}</div>
                {profileData?.email ? <div className="truncate text-sm text-slate-500">{profileData.email}</div> : null}
                <Badge tone="green" className="mt-2">
                  {roleLabel}
                </Badge>
              </div>
            </CardBody>
          </Card>

          <FormSection
            className="lg:col-span-2"
            title="Profile photo"
            description="Drag & drop or upload a photo for your staff profile."
          >
            <StaffPhotoUploader userId={userId} initialUrl={profilePhotoUrl} saveAction={saveProfilePhoto} />
          </FormSection>
        </div>
      ) : null}
    </div>
  );
}

function profileToast(message: string) {
  return `/admin/profile?toast=${encodeURIComponent(message)}&toast_type=error`;
}
