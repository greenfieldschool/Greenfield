import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import GuardianPhotoUploader from "./GuardianPhotoUploader";
import UrlToast from "@/components/url-toast";
import PasswordInput from "@/components/password-input";
import { Mail, Phone, UserX, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";

type GuardianRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  profile_photo_url: string | null;
  interests: string[];
};

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  level: string;
  status: string;
};

type StudentGuardianRow = {
  student_id: string;
  guardian_id: string;
  relationship: string | null;
  is_primary: boolean;
};

export default async function AdminGuardianDetailPage({
  params
}: {
  params: { id: string };
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const guardianId = params.id;

  const { data: guardianData } = await supabase
    .from("guardians")
    .select("id, full_name, email, phone, profile_photo_url, interests")
    .eq("id", guardianId)
    .maybeSingle();

  const guardian = guardianData as GuardianRow | null;

  if (!guardian) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: "/admin/guardians", label: "Back to guardians" }} title="Guardian not found" />
        <Card>
          <EmptyState
            icon={UserX}
            title="We couldn't find this guardian"
            description="They may have been removed, or the link is wrong."
            action={
              <ButtonLink href="/admin/guardians" variant="secondary" size="sm">
                Back to guardians
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  const guardianFullName = guardian.full_name;
  const guardianEmail = guardian.email;

  const { data: studentsData } = await supabase
    .from("students")
    .select("id, first_name, last_name, level, status")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });

  const allStudents = (studentsData ?? []) as StudentRow[];

  const { data: linksData } = await supabase
    .from("student_guardians")
    .select("student_id, guardian_id, relationship, is_primary")
    .eq("guardian_id", guardianId);

  const links = (linksData ?? []) as StudentGuardianRow[];
  const linkedStudentIds = new Set(links.map((l) => l.student_id));

  const linked = allStudents
    .filter((s) => linkedStudentIds.has(s.id))
    .map((s) => {
      const link = links.find((l) => l.student_id === s.id);
      return {
        ...s,
        relationship: link?.relationship ?? null,
        is_primary: link?.is_primary ?? false
      };
    });

  const availableStudents = allStudents.filter((s) => !linkedStudentIds.has(s.id));

  const {
    data: { user: currentUser }
  } = await supabase.auth.getUser();

  const { data: currentUserProfile } = currentUser
    ? await supabase.from("profiles").select("role").eq("id", currentUser.id).maybeSingle()
    : { data: null as { role?: string | null } | null };

  const currentRole = (currentUserProfile?.role ?? null) as string | null;
  const isAdmin = currentRole === "super_admin" || currentRole === "admin";

  const { data: portalLinkData } = await supabase
    .from("guardian_user_links")
    .select("user_id")
    .eq("guardian_id", guardianId)
    .maybeSingle();

  const portalUserId = (portalLinkData as { user_id?: string } | null)?.user_id ?? null;

  async function updateGuardianProfile(formData: FormData) {
    "use server";

    if (!isAdmin) redirect(guardianToast(guardianId, "You do not have permission to edit guardian profiles"));

    const photoUrlRaw = String(formData.get("profile_photo_url") ?? "").trim();
    const interestsRaw = String(formData.get("interests") ?? "").trim();

    const profilePhotoUrl = photoUrlRaw.length ? photoUrlRaw : null;
    const interests = interestsRaw.length
      ? interestsRaw
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length)
      : [];

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(guardianToast(guardianId, "Server error — Supabase is not configured"));

    const { error } = await supabase
      .from("guardians")
      .update({ profile_photo_url: profilePhotoUrl, interests })
      .eq("id", guardianId);
    if (error) redirect(guardianToast(guardianId, error.message));

    revalidatePath(`/admin/guardians/${guardianId}`);
    revalidatePath("/admin/guardians");
  }

  async function saveGuardianPhoto(formData: FormData) {
    "use server";

    if (!isAdmin) redirect(guardianToast(guardianId, "You do not have permission to change guardian photos"));

    const photoUrlRaw = String(formData.get("profile_photo_url") ?? "").trim();
    const profilePhotoUrl = photoUrlRaw.length ? photoUrlRaw : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(guardianToast(guardianId, "Server error — Supabase is not configured"));

    const { error } = await supabase.from("guardians").update({ profile_photo_url: profilePhotoUrl }).eq("id", guardianId);
    if (error) redirect(guardianToast(guardianId, error.message));

    revalidatePath(`/admin/guardians/${guardianId}`);
    revalidatePath("/admin/guardians");
  }

  async function linkStudent(formData: FormData) {
    "use server";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const relationship = String(formData.get("relationship") ?? "").trim();
    const isPrimary = formData.get("is_primary") === "on";

    if (!studentId) redirect(guardianToast(guardianId, "Pick a student to link"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(guardianToast(guardianId, "Server error — Supabase is not configured"));

    if (!(await hasStaffRole(supabase))) {
      redirect(guardianToast(guardianId, "You do not have permission to link students"));
    }

    const { error } = await supabase.from("student_guardians").insert({
      student_id: studentId,
      guardian_id: guardianId,
      relationship: relationship.length ? relationship : null,
      is_primary: isPrimary
    });
    if (error) redirect(guardianToast(guardianId, error.message));

    revalidatePath(`/admin/guardians/${guardianId}`);
  }

  async function createPortalAccount(formData: FormData) {
    "use server";

    const password = String(formData.get("password") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();

    if (!email || password.length < 8) {
      redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("Email or password is invalid (min 8 chars)")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(guardianToast(guardianId, "Server error — Supabase is not configured"));

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("You must be logged in")}&toast_type=error`);
    }

    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (me?.role ?? null) as string | null;
    const isAdmin = role === "super_admin" || role === "admin";
    if (!isAdmin) {
      redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("You do not have permission to do this")}&toast_type=error`);
    }

    const service = getSupabaseServiceClient();
    if (!service) {
      redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("Service client unavailable — check server config")}&toast_type=error`);
    }

    const { data: created, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: guardianFullName }
    });

    if (error || !created.user) {
      redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent(error?.message ?? "Failed to create portal account")}&toast_type=error`);
    }

    await service
      .from("profiles")
      .update({ role: "parent", email, full_name: guardianFullName })
      .eq("id", created.user.id);

    await service.from("guardian_user_links").upsert(
      {
        user_id: created.user.id,
        guardian_id: guardianId
      },
      { onConflict: "user_id" }
    );

    revalidatePath(`/admin/guardians/${guardianId}`);
    redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("Portal account created successfully")}&toast_type=success`);
  }

  async function resetPortalPassword(formData: FormData) {
    "use server";

    const password = String(formData.get("password") ?? "").trim();
    const userId = String(formData.get("user_id") ?? "").trim();

    if (!userId || password.length < 8) {
      redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("Password must be at least 8 characters")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(guardianToast(guardianId, "Server error — Supabase is not configured"));

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("You must be logged in")}&toast_type=error`);
    }

    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (me?.role ?? null) as string | null;
    const isAdmin = role === "super_admin" || role === "admin";
    if (!isAdmin) {
      redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("You do not have permission to do this")}&toast_type=error`);
    }

    const service = getSupabaseServiceClient();
    if (!service) {
      redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("Service client unavailable — check server config")}&toast_type=error`);
    }

    const { error } = await service.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) {
      redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent(error.message ?? "Failed to reset password")}&toast_type=error`);
    }

    revalidatePath(`/admin/guardians/${guardianId}`);
    redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("Portal password updated successfully")}&toast_type=success`);
  }

  async function updateGuardianBasics(formData: FormData) {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(guardianToast(guardianId, "Server error — Supabase is not configured"));

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) redirect(guardianToast(guardianId, "You must be logged in"));

    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (me?.role ?? null) as string | null;
    const isAllowed = role === "super_admin" || role === "admin";
    if (!isAllowed) redirect(guardianToast(guardianId, "You do not have permission to edit guardians"));

    const fullName = String(formData.get("full_name") ?? "").trim();
    const emailRaw = String(formData.get("email") ?? "").trim();
    const phoneRaw = String(formData.get("phone") ?? "").trim();

    if (!fullName) redirect(guardianToast(guardianId, "Full name is required"));

    const email = emailRaw.length ? emailRaw : null;
    const phone = phoneRaw.length ? phoneRaw : null;

    const { error } = await supabase
      .from("guardians")
      .update({ full_name: fullName, email, phone })
      .eq("id", guardianId);
    if (error) redirect(guardianToast(guardianId, error.message));

    revalidatePath(`/admin/guardians/${guardianId}`);
    revalidatePath("/admin/guardians");
    redirect(`/admin/guardians/${guardianId}?toast=${encodeURIComponent("Guardian details saved")}&toast_type=success`);
  }

  async function unlinkStudent(formData: FormData) {
    "use server";

    const studentId = String(formData.get("student_id") ?? "").trim();
    if (!studentId) redirect(guardianToast(guardianId, "Missing student — reload and try again"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(guardianToast(guardianId, "Server error — Supabase is not configured"));

    if (!(await hasStaffRole(supabase))) {
      redirect(guardianToast(guardianId, "You do not have permission to unlink students"));
    }

    const { error } = await supabase
      .from("student_guardians")
      .delete()
      .eq("student_id", studentId)
      .eq("guardian_id", guardianId);
    if (error) redirect(guardianToast(guardianId, error.message));

    revalidatePath(`/admin/guardians/${guardianId}`);
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/guardians", label: "Back to guardians" }}
        eyebrow="Guardian"
        title={guardianFullName}
        description={[guardianEmail, guardian.phone].filter(Boolean).join(" · ") || undefined}
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Linked students"
              description={`${linked.length} student${linked.length === 1 ? "" : "s"} linked to this guardian`}
            />
            {linked.length ? (
              <div className="gf-table-wrap">
                <table className="gf-table min-w-[620px]">
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Level</th>
                      <th>Status</th>
                      <th>Relationship</th>
                      <th className="text-right">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {linked.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="flex items-center gap-3">
                            <Avatar name={`${s.first_name} ${s.last_name}`} size="sm" />
                            <span className="font-semibold text-slate-900">
                              {s.first_name} {s.last_name}
                            </span>
                            {s.is_primary ? <Badge tone="gold">Primary</Badge> : null}
                          </div>
                        </td>
                        <td className="capitalize">{s.level}</td>
                        <td>
                          <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                        </td>
                        <td>{s.relationship ?? "—"}</td>
                        <td className="text-right">
                          <form action={unlinkStudent}>
                            <input type="hidden" name="student_id" value={s.id} />
                            <ConfirmSubmitButton
                              className={buttonClasses({
                                variant: "secondary",
                                size: "sm",
                                className: "text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                              })}
                              confirmMessage={`Unlink ${s.first_name} ${s.last_name} from ${guardianFullName}?`}
                            >
                              Unlink
                            </ConfirmSubmitButton>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Users}
                title="No students linked yet."
                description="Use the form below to connect this guardian to their children."
              />
            )}
          </Card>

          <form action={linkStudent}>
            <FormSection
              title="Link a student"
              description="Connect this guardian to a child so they appear on the parent portal."
              footer={
                <SubmitButton variant="primary" pendingText="Linking…" disabled={!availableStudents.length}>
                  Link student
                </SubmitButton>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Student" htmlFor="link-student" required>
                  <select
                    id="link-student"
                    className="gf-select"
                    name="student_id"
                    required
                    defaultValue=""
                    disabled={!availableStudents.length}
                  >
                    <option value="" disabled>
                      {availableStudents.length ? "Select a student" : "No available students"}
                    </option>
                    {availableStudents.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} ({s.level})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Relationship" htmlFor="link-relationship">
                  <input
                    id="link-relationship"
                    className="gf-input"
                    name="relationship"
                    placeholder="e.g. Mother, Father, Guardian"
                  />
                </Field>
                <label htmlFor="is_primary" className="flex items-center gap-3 text-sm font-medium text-slate-700 sm:col-span-2">
                  <input className="gf-checkbox" name="is_primary" type="checkbox" id="is_primary" />
                  Primary guardian
                </label>
              </div>
            </FormSection>
          </form>

          {isAdmin ? (
            <form action={updateGuardianBasics}>
              <FormSection
                title="Edit guardian"
                description="Name and contact details."
                footer={
                  <SubmitButton variant="primary" pendingText="Saving…">
                    Save changes
                  </SubmitButton>
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="guardian-full-name" required className="sm:col-span-2">
                    <input
                      id="guardian-full-name"
                      className="gf-input"
                      name="full_name"
                      defaultValue={guardian.full_name}
                      required
                    />
                  </Field>
                  <Field label="Email" htmlFor="guardian-email">
                    <input
                      id="guardian-email"
                      className="gf-input"
                      name="email"
                      type="email"
                      defaultValue={guardian.email ?? ""}
                    />
                  </Field>
                  <Field label="Phone" htmlFor="guardian-phone">
                    <input
                      id="guardian-phone"
                      className="gf-input"
                      name="phone"
                      type="tel"
                      defaultValue={guardian.phone ?? ""}
                    />
                  </Field>
                </div>
              </FormSection>
            </form>
          ) : null}

          {isAdmin ? (
            <FormSection title="Profile" description="Profile enrichment fields (admin-managed).">
              <GuardianPhotoUploader
                guardianId={guardianId}
                initialUrl={guardian.profile_photo_url ?? null}
                saveAction={saveGuardianPhoto}
              />
              <form action={updateGuardianProfile} className="mt-6 grid gap-4 border-t border-slate-100 pt-5">
                <Field label="Profile photo URL (optional)" htmlFor="guardian-photo-url">
                  <input
                    id="guardian-photo-url"
                    className="gf-input"
                    name="profile_photo_url"
                    defaultValue={guardian.profile_photo_url ?? ""}
                    placeholder="https://..."
                  />
                </Field>
                <Field label="Interests (comma separated)" htmlFor="guardian-interests">
                  <input
                    id="guardian-interests"
                    className="gf-input"
                    name="interests"
                    defaultValue={(guardian.interests ?? []).join(", ")}
                    placeholder="e.g. PTA, Volunteering, Reading"
                  />
                </Field>
                <div className="flex justify-end">
                  <SubmitButton variant="primary" pendingText="Saving…">
                    Save profile
                  </SubmitButton>
                </div>
              </form>
            </FormSection>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card>
            <CardBody>
              <div className="flex items-center gap-4">
                <Avatar name={guardianFullName} src={guardian.profile_photo_url} size="lg" />
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-slate-900">{guardianFullName}</div>
                  <div className="text-sm text-slate-500">Guardian</div>
                </div>
              </div>
              <dl className="mt-5 space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <dt>
                    <Mail className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <span className="sr-only">Email</span>
                  </dt>
                  <dd className="min-w-0 truncate text-slate-700">{guardianEmail ?? "—"}</dd>
                </div>
                <div className="flex items-center gap-3">
                  <dt>
                    <Phone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    <span className="sr-only">Phone</span>
                  </dt>
                  <dd className="text-slate-700">{guardian.phone ?? "—"}</dd>
                </div>
              </dl>
              {(guardian.interests ?? []).length ? (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {(guardian.interests ?? []).map((it) => (
                    <Badge key={it} tone="slate">
                      {it}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardBody>
          </Card>

          {isAdmin ? (
            <Card>
              <CardHeader
                title="Portal access"
                description="Create a parent portal account and set/reset the password (for printing). Parents cannot reset passwords themselves."
                action={portalUserId ? <Badge tone="green" dot>Active</Badge> : <Badge tone="slate">None</Badge>}
              />
              <CardBody className="space-y-4">
                {!guardianEmail ? (
                  <Alert tone="warning">Add an email address for this guardian before creating portal access.</Alert>
                ) : null}

                {portalUserId ? (
                  <>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                      <div className="text-sm font-semibold text-slate-900">Account exists</div>
                      <div className="mt-0.5 break-all font-mono text-xs text-slate-600">User ID: {portalUserId}</div>
                    </div>
                    <form action={resetPortalPassword} className="space-y-4">
                      <input type="hidden" name="user_id" value={portalUserId} />
                      <PasswordInput id="guardian-reset-password" label="New password" name="password" minLength={8} required />
                      <SubmitButton
                        className={buttonClasses({ variant: "secondary", className: "w-full" })}
                        pendingText="Saving…"
                        showSpinner={false}
                      >
                        Reset password
                      </SubmitButton>
                    </form>
                  </>
                ) : (
                  <form action={createPortalAccount} className="space-y-4">
                    <Field label="Email" htmlFor="guardian-portal-email" required>
                      <input
                        id="guardian-portal-email"
                        className="gf-input"
                        name="email"
                        type="email"
                        defaultValue={guardianEmail ?? ""}
                        required
                      />
                    </Field>
                    <PasswordInput id="guardian-portal-password" label="Initial password" name="password" minLength={8} required />
                    <SubmitButton
                      className={buttonClasses({ variant: "primary", className: "w-full" })}
                      pendingText="Creating…"
                      disabled={!guardianEmail}
                    >
                      Create portal account
                    </SubmitButton>
                  </form>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const STAFF_ROLES = new Set(["super_admin", "admin", "teacher", "front_desk", "nurse"]);

function guardianToast(guardianId: string, message: string, type: "error" | "success" = "error") {
  return `/admin/guardians/${guardianId}?toast=${encodeURIComponent(message)}&toast_type=${type}`;
}

// Server-side check for the link/unlink actions: any staff role that can open this page may use them.
async function hasStaffRole(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (data as { role?: string | null } | null)?.role ?? null;
  return role !== null && STAFF_ROLES.has(role);
}

function statusTone(status: string): BadgeTone {
  if (status === "active" || status === "enrolled" || status === "graduated") return "green";
  if (status === "applied") return "gold";
  if (status === "withdrawn") return "red";
  return "slate";
}
