import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection } from "@/components/ui/form-section";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { LEARN } from "@/lib/learn-guides";

const PATH = "/admin/settings";
const STAFF_ROLES = ["super_admin", "admin", "teacher", "front_desk", "nurse"];

function back(message: string, type: "success" | "error" = "success"): never {
  redirect(`${PATH}?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

// Who signs every certificate as head teacher, and the words printed under the signature.
async function saveHeadTeacher(formData: FormData) {
  "use server";
  const supabase = getSupabaseServerClient();
  if (!supabase) back("Server error — please try again later.", "error");
  const headId = String(formData.get("head_teacher_id") ?? "").trim() || null;
  const title = String(formData.get("head_teacher_title") ?? "").trim().replace(/\s+/g, " ");
  if (title.length < 2 || title.length > 40) back("Type the title printed under the signature, e.g. Head teacher.", "error");

  const { data, error } = await supabase
    .from("school_settings")
    .update({ head_teacher_id: headId, head_teacher_title: title, updated_at: new Date().toISOString() })
    .eq("id", true)
    .select("id");
  if (error) back(/does not exist|schema cache/i.test(error.message) ? "Run the database update 20261103_staff_signatures.sql first." : "Couldn't save. Please try again.", "error");
  if (!data?.length) back("Only admins can change this.", "error");

  revalidatePath(PATH);
  back("Saved. Certificates now use this signature.");
}

export default async function AdminSettingsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: settingsData, error: settingsError }, { data: staffData }, { data: sigData }] = await Promise.all([
    supabase.from("school_settings").select("head_teacher_id, head_teacher_title").eq("id", true).maybeSingle(),
    supabase.from("profiles").select("id, full_name, email, role").in("role", STAFF_ROLES).order("full_name"),
    supabase.from("staff_signatures").select("user_id")
  ]);
  const settings = settingsData as { head_teacher_id: string | null; head_teacher_title: string | null } | null;
  const staff = (staffData ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string }>;
  const signed = new Set(((sigData ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
  const head = staff.find((p) => p.id === settings?.head_teacher_id) ?? null;
  const label = (p: { full_name: string | null; email: string | null }) => p.full_name || p.email || "Staff";

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader learn={LEARN.certificates} eyebrow="Admin" title="Settings" description="School-wide settings." />

      <FormSection
        id="certificates"
        title="Certificates: head teacher's signature"
        description="Whose signature is printed on the head teacher's line of every certificate. Each person draws their own signature on My profile; class teachers' signatures go on their own classes' certificates."
      >
        {settingsError ? (
          <Alert tone="warning">This needs a database update first. Ask the school&apos;s IT person to run 20261103_staff_signatures.sql.</Alert>
        ) : (
          <form action={saveHeadTeacher} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="head_teacher_id" className="gf-label">
                  Head teacher
                </label>
                <select id="head_teacher_id" name="head_teacher_id" className="gf-select" defaultValue={settings?.head_teacher_id ?? ""}>
                  <option value="">Nobody yet (blank line, sign by hand)</option>
                  {staff.map((p) => (
                    <option key={p.id} value={p.id}>
                      {label(p)}
                      {signed.has(p.id) ? " (signature saved)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="head_teacher_title" className="gf-label">
                  Title printed under the signature
                </label>
                <input
                  id="head_teacher_title"
                  name="head_teacher_title"
                  className="gf-input"
                  defaultValue={settings?.head_teacher_title ?? "Head teacher"}
                  required
                  minLength={2}
                  maxLength={40}
                  placeholder="Head teacher, Principal, Head of School …"
                />
              </div>
            </div>
            {head ? (
              signed.has(head.id) ? (
                <Badge tone="green">{label(head)} has saved a signature</Badge>
              ) : (
                <Alert tone="warning">
                  {label(head)} hasn&apos;t saved a signature yet, so certificates show a blank line. Ask them to open My profile → Your signature.
                </Alert>
              )
            ) : null}
            <SubmitButton>Save</SubmitButton>
          </form>
        )}
      </FormSection>
    </div>
  );
}
