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
import { Alert } from "@/components/ui/alert";
import SignaturePad from "@/components/signature-pad";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { formatLagosDate } from "@/lib/lagos-dates";
import { removeSignature, saveSignature } from "./signature-actions";

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

  // Your saved signature, and whether you are the head teacher on certificates (20261103).
  const [{ data: sigData, error: sigError }, { data: settingsData }] = userId
    ? await Promise.all([
        supabase.from("staff_signatures").select("signature, signed_name, updated_at").eq("user_id", userId).maybeSingle(),
        supabase.from("school_settings").select("head_teacher_id, head_teacher_title").eq("id", true).maybeSingle()
      ])
    : [{ data: null, error: null }, { data: null }];
  const signature = sigData as { signature: string; signed_name: string; updated_at: string } | null;
  const settings = settingsData as { head_teacher_id: string | null; head_teacher_title: string | null } | null;
  const isHead = Boolean(userId && settings?.head_teacher_id === userId);
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

          <div id="signature" className="scroll-mt-24 lg:col-span-3">
            <FormSection
              title="Your signature"
              description={
                isHead
                  ? `Printed on every certificate as the ${settings?.head_teacher_title?.trim() || "Head teacher"}.`
                  : role === "teacher"
                    ? "Printed on the certificates of the classes you are class teacher of. Without one, certificates show a blank line to sign by hand."
                    : "Printed on certificates you sign. Without one, certificates show a blank line to sign by hand."
              }
            >
              {sigError ? (
                <Alert tone="warning">Signatures need a database update first. Ask the school&apos;s IT person to run 20261103_staff_signatures.sql.</Alert>
              ) : (
                <div className="space-y-6">
                  {signature ? (
                    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved signature</div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={signature.signature} alt={`Signature of ${signature.signed_name}`} className="mt-2 h-16 max-w-full object-contain object-left" />
                        <div className="mt-1 border-t border-dotted border-slate-400 pt-1 text-sm font-medium text-slate-700">{signature.signed_name}</div>
                        <div className="mt-1 text-xs text-slate-500">Saved {formatLagosDate(signature.updated_at)}</div>
                      </div>
                      <form action={removeSignature}>
                        <ConfirmSubmitButton
                          confirmMessage="Remove your signature? Certificates will show a blank line for you to sign by hand."
                          className="text-sm font-semibold text-red-700 hover:underline"
                        >
                          Remove signature
                        </ConfirmSubmitButton>
                      </form>
                    </div>
                  ) : null}
                  <div>
                    {signature ? <h3 className="mb-2 text-sm font-semibold text-slate-900">Draw a new one to replace it</h3> : null}
                    <SignaturePad key={signature?.updated_at ?? "none"} action={saveSignature} defaultName={signature?.signed_name ?? profileData?.full_name ?? ""} />
                  </div>
                </div>
              )}
            </FormSection>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function profileToast(message: string) {
  return `/admin/profile?toast=${encodeURIComponent(message)}&toast_type=error`;
}
