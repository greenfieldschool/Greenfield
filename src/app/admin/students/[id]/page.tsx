import Link from "next/link";
import { ExternalLink, KeyRound, UserMinus, Users } from "lucide-react";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import SubmitButton from "@/components/submit-button";
import StudentPhotoUploader from "./StudentPhotoUploader";
import UrlToast from "@/components/url-toast";
import PasswordInput from "@/components/password-input";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate } from "@/lib/lagos-dates";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { DetailList } from "../../applications/_ui";

function studentStatusTone(status: string): BadgeTone {
  switch (status) {
    case "active":
      return "green";
    case "enrolled":
      return "blue";
    case "applied":
      return "gold";
    case "graduated":
      return "violet";
    case "withdrawn":
      return "red";
    default:
      return "slate";
  }
}

function capitalize(v: string) {
  return v ? v.charAt(0).toUpperCase() + v.slice(1) : v;
}

const BACK = { href: "/admin/students", label: "Back to students" };

function toastUrl(studentId: string, message: string, type: "success" | "error" = "error") {
  return `/admin/students/${studentId}?toast=${encodeURIComponent(message)}&toast_type=${type}`;
}

const NO_DB = "Database is not configured — nothing was saved";

const STAFF_ROLES = ["super_admin", "admin", "teacher", "front_desk", "nurse"];

// Server-side guard for actions any staff member may take on a student (mirrors middleware).
async function isStaffUser(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>) {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return STAFF_ROLES.includes(String(data?.role ?? ""));
}

function admissionNumberToEmail(admissionNumberRaw: string) {
  const admissionNumber = admissionNumberRaw.trim().toLowerCase();
  const domain = (process.env.NEXT_PUBLIC_STUDENT_LOGIN_EMAIL_DOMAIN ?? "students.greenfield.local")
    .trim()
    .toLowerCase();
  const normalizedUser = admissionNumber.replace(/[^a-z0-9._-]/g, "");
  return `${normalizedUser}@${domain}`;
}

type StudentRow = {
  id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  admission_number: string | null;
  profile_photo_url: string | null;
  hobbies: string[];
  passport_photo_url?: string | null;
  favorite_sports?: string | null;
  future_aspiration?: string | null;
  child_with?: string | null;
  sex?: string | null;
  religion?: string | null;
  admissions_application_id?: string | null;
  level: string;
  class_id: string | null;
  classes: Array<{ id: string; level: string; name: string }>;
  status: string;
  date_of_birth: string | null;
};

type AdmissionsApplicationRow = {
  id: string;
  status: string;
  section: string | null;
  parent_name: string | null;
  phone: string | null;
  email: string | null;
  desired_start: string | null;
  preferred_contact: string | null;
  data: Record<string, unknown>;
};

type ClassRow = {
  id: string;
  level: string;
  name: string;
  active: boolean;
};

type GuardianRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

type StudentGuardianRow = {
  student_id: string;
  guardian_id: string;
  relationship: string | null;
  is_primary: boolean;
};

export default async function AdminStudentDetailPage({
  params,
  searchParams
}: {
  params: { id: string };
  searchParams?: Record<string, string | string[] | undefined>;
}) {
  // Re-mount UrlToast whenever a new toast arrives (redirects back to this same page keep client state).
  const toastKey = typeof searchParams?.toast === "string" ? searchParams.toast : "none";
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const studentId = params.id;

  const [{ data: studentData }, { data: classesData }] = await Promise.all([
    supabase
      .from("students")
      .select("*")
      .eq("id", studentId)
      .maybeSingle(),
    supabase.from("classes").select("id, level, name, active").eq("active", true).order("level").order("name")
  ]);

  const student = (studentData ?? null) as unknown as StudentRow | null;
  const classOptions = (classesData ?? []) as ClassRow[];

  const { data: guardiansData } = await supabase
    .from("guardians")
    .select("id, full_name, email, phone")
    .order("full_name", { ascending: true });

  const allGuardians = (guardiansData ?? []) as GuardianRow[];

  const { data: linksData } = await supabase
    .from("student_guardians")
    .select("student_id, guardian_id, relationship, is_primary")
    .eq("student_id", studentId);

  const links = (linksData ?? []) as StudentGuardianRow[];

  const linkedGuardianIds = new Set(links.map((l) => l.guardian_id));

  const linked = allGuardians
    .filter((g) => linkedGuardianIds.has(g.id))
    .map((g) => {
      const link = links.find((l) => l.guardian_id === g.id);
      return {
        ...g,
        relationship: link?.relationship ?? null,
        is_primary: link?.is_primary ?? false
      };
    });

  const availableGuardians = allGuardians.filter((g) => !linkedGuardianIds.has(g.id));

  const admissionsApplicationId = (student?.admissions_application_id ?? null) as string | null;
  const { data: admissionsApplicationData } = admissionsApplicationId
    ? await supabase
        .from("admissions_applications")
        .select("id,status,section,parent_name,phone,email,desired_start,preferred_contact,data")
        .eq("id", admissionsApplicationId)
        .maybeSingle()
    : { data: null as unknown };

  const admissionsApplication = (admissionsApplicationData ?? null) as AdmissionsApplicationRow | null;

  const {
    data: { user: currentUser }
  } = await supabase.auth.getUser();

  const { data: currentUserProfile } = currentUser
    ? await supabase.from("profiles").select("role").eq("id", currentUser.id).maybeSingle()
    : { data: null as { role?: string | null } | null };

  const currentRole = (currentUserProfile?.role ?? null) as string | null;
  const isAdmin = currentRole === "super_admin" || currentRole === "admin";

  const { data: existingPortalLink } = await supabase
    .from("student_user_links")
    .select("user_id")
    .eq("student_id", studentId)
    .maybeSingle();
  const existingPortalUserId = (existingPortalLink as { user_id?: string } | null)?.user_id ?? null;

  async function createPortalAccount(formData: FormData) {
    "use server";

    const admissionNumberRaw = String(formData.get("admission_number") ?? "").trim();
    const password = String(formData.get("password") ?? "").trim();

    if (!admissionNumberRaw || password.length < 8) {
      redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("Invalid admission number or password too short")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(studentId, NO_DB));

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("You must be logged in")}&toast_type=error`);
    }

    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (me?.role ?? null) as string | null;
    const isAllowed = role === "super_admin" || role === "admin";
    if (!isAllowed) {
      redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("You do not have permission to do this")}&toast_type=error`);
    }

    const service = getSupabaseServiceClient();
    if (!service) {
      redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("Service client unavailable — check server config")}&toast_type=error`);
    }

    const email = admissionNumberToEmail(admissionNumberRaw);
    const studentFullName = `${String(formData.get("student_first_name") ?? "").trim()} ${String(
      formData.get("student_last_name") ?? ""
    ).trim()}`.trim();

    const { data: created, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: studentFullName.length ? { full_name: studentFullName } : undefined
    });

    if (error || !created.user) {
      redirect(`/admin/students/${studentId}?toast=${encodeURIComponent(error?.message ?? "Failed to create portal account")}&toast_type=error`);
    }

    await service
      .from("profiles")
      .upsert({ id: created.user.id, role: "student", email, full_name: studentFullName.length ? studentFullName : null }, { onConflict: "id" });

    await service.from("student_user_links").upsert(
      {
        user_id: created.user.id,
        student_id: studentId
      },
      { onConflict: "user_id" }
    );

    revalidatePath(`/admin/students/${studentId}`);
    redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("Portal account created successfully")}&toast_type=success`);
  }

  async function resetPortalPassword(formData: FormData) {
    "use server";

    const password = String(formData.get("password") ?? "").trim();
    const userId = String(formData.get("user_id") ?? "").trim();

    if (!userId || password.length < 8) {
      redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("Password must be at least 8 characters")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(studentId, NO_DB));

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("You must be logged in")}&toast_type=error`);
    }

    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (me?.role ?? null) as string | null;
    const isAllowed = role === "super_admin" || role === "admin";
    if (!isAllowed) {
      redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("You do not have permission to do this")}&toast_type=error`);
    }

    const service = getSupabaseServiceClient();
    if (!service) {
      redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("Service client unavailable — check server config")}&toast_type=error`);
    }

    const { error } = await service.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (error) {
      redirect(`/admin/students/${studentId}?toast=${encodeURIComponent(error.message ?? "Failed to reset password")}&toast_type=error`);
    }

    revalidatePath(`/admin/students/${studentId}`);
    redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("Portal password updated successfully")}&toast_type=success`);
  }

  async function updateStudent(formData: FormData) {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(studentId, NO_DB));

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) redirect(toastUrl(studentId, "You must be logged in"));

    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (me?.role ?? null) as string | null;
    const isAllowed = role === "super_admin" || role === "admin";
    if (!isAllowed) redirect(toastUrl(studentId, "Only admins can edit student details"));

    const firstName = String(formData.get("first_name") ?? "").trim();
    const middleName = String(formData.get("middle_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    const dateOfBirthRaw = String(formData.get("date_of_birth") ?? "").trim();
    const admissionNumber = String(formData.get("admission_number") ?? "").trim();
    let level = String(formData.get("level") ?? "").trim();
    const classIdRaw = String(formData.get("class_id") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    if (!firstName || !lastName || !level || !status) {
      redirect(toastUrl(studentId, "First name, last name, level and status are required"));
    }

    const classId = classIdRaw.length ? classIdRaw : null;
    const dateOfBirth = dateOfBirthRaw.length ? dateOfBirthRaw : null;

    // Sync student level with class level if class is assigned
    if (classId) {
      const { data: cls } = await supabase
        .from("classes")
        .select("level")
        .eq("id", classId)
        .maybeSingle();
      if (cls?.level) {
        level = cls.level;
      }
    }

    const { error: updateError } = await supabase
      .from("students")
      .update({
        first_name: firstName,
        middle_name: middleName.length ? middleName : null,
        last_name: lastName,
        date_of_birth: dateOfBirth,
        admission_number: admissionNumber.length ? admissionNumber : null,
        level,
        class_id: classId,
        status
      })
      .eq("id", studentId);

    if (updateError) redirect(toastUrl(studentId, `Could not save student: ${updateError.message}`));

    revalidatePath(`/admin/students/${studentId}`);
    revalidatePath("/admin/students");
    redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("Student details saved")}&toast_type=success`);
  }

  async function saveStudentPhoto(formData: FormData) {
    "use server";

    if (!isAdmin) redirect(toastUrl(studentId, "Only admins can change the student photo"));

    const photoUrlRaw = String(formData.get("profile_photo_url") ?? "").trim();
    const profilePhotoUrl = photoUrlRaw.length ? photoUrlRaw : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(studentId, NO_DB));

    const { error: photoError } = await supabase
      .from("students")
      .update({ profile_photo_url: profilePhotoUrl })
      .eq("id", studentId);

    if (photoError) redirect(toastUrl(studentId, `Could not save photo: ${photoError.message}`));

    revalidatePath(`/admin/students/${studentId}`);
    revalidatePath("/admin/students");
    redirect(toastUrl(studentId, profilePhotoUrl ? "Photo saved" : "Photo removed", "success"));
  }

  async function updateStudentProfile(formData: FormData) {
    "use server";

    if (!isAdmin) redirect(toastUrl(studentId, "Only admins can edit the profile"));

    const photoUrlRaw = String(formData.get("profile_photo_url") ?? "").trim();
    const hobbiesRaw = String(formData.get("hobbies") ?? "").trim();

    const profilePhotoUrl = photoUrlRaw.length ? photoUrlRaw : null;
    const hobbies = hobbiesRaw.length
      ? hobbiesRaw
          .split(",")
          .map((v) => v.trim())
          .filter((v) => v.length)
      : [];

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(studentId, NO_DB));

    const { error: profileError } = await supabase
      .from("students")
      .update({ profile_photo_url: profilePhotoUrl, hobbies })
      .eq("id", studentId);

    if (profileError) redirect(toastUrl(studentId, `Could not save profile: ${profileError.message}`));

    revalidatePath(`/admin/students/${studentId}`);
    revalidatePath("/admin/students");
    redirect(toastUrl(studentId, "Profile saved", "success"));
  }

  async function addGuardian(formData: FormData) {
    "use server";

    const guardianId = String(formData.get("guardian_id") ?? "").trim();
    const relationship = String(formData.get("relationship") ?? "").trim();
    const isPrimary = formData.get("is_primary") === "on";

    if (!guardianId) redirect(toastUrl(studentId, "Choose a guardian to link"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(studentId, NO_DB));
    if (!(await isStaffUser(supabase))) redirect(toastUrl(studentId, "You don't have permission to change guardians"));

    const { error: linkError } = await supabase.from("student_guardians").insert({
      student_id: studentId,
      guardian_id: guardianId,
      relationship: relationship.length ? relationship : null,
      is_primary: isPrimary
    });

    if (linkError) redirect(toastUrl(studentId, `Could not link guardian: ${linkError.message}`));

    revalidatePath(`/admin/students/${studentId}`);
    redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("Guardian linked")}&toast_type=success`);
  }

  async function removeGuardian(formData: FormData) {
    "use server";

    const guardianId = String(formData.get("guardian_id") ?? "").trim();
    if (!guardianId) redirect(toastUrl(studentId, "No guardian selected"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(studentId, NO_DB));
    if (!(await isStaffUser(supabase))) redirect(toastUrl(studentId, "You don't have permission to change guardians"));

    const { error: unlinkError } = await supabase
      .from("student_guardians")
      .delete()
      .eq("student_id", studentId)
      .eq("guardian_id", guardianId);

    if (unlinkError) redirect(toastUrl(studentId, `Could not remove guardian: ${unlinkError.message}`));

    revalidatePath(`/admin/students/${studentId}`);
    redirect(`/admin/students/${studentId}?toast=${encodeURIComponent("Guardian removed")}&toast_type=success`);
  }

  if (!student) {
    return (
      <div className="space-y-6">
        <PageHeader back={BACK} eyebrow="Student" title="Student not found" />
        <Alert tone="warning" title="We couldn't find this student.">
          They may have been removed, or the link is incorrect.
        </Alert>
      </div>
    );
  }

  // `select("*")` doesn't embed `classes`, so fall back to the already-loaded class list for display.
  const currentClassName =
    firstOrNull(student.classes)?.name ?? classOptions.find((c) => c.id === student.class_id)?.name ?? null;
  const fullName = `${student.first_name} ${student.last_name}`;
  const app = admissionsApplication;

  const mainColumn = (
    <div className="space-y-6">
      {isAdmin ? (
      <form action={updateStudent}>
        <FormSection
          title="Edit student"
          description={`Current class: ${currentClassName ?? "—"}. Choosing a class also updates the level to match.`}
          footer={
            <SubmitButton variant="primary" pendingText="Saving…">
              Save changes
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" htmlFor="student-first_name" required>
              <input id="student-first_name" className="gf-input" name="first_name" defaultValue={student.first_name} required />
            </Field>
            <Field label="Middle name" htmlFor="student-middle_name">
              <input
                id="student-middle_name"
                className="gf-input"
                name="middle_name"
                defaultValue={student.middle_name ?? ""}
                placeholder="(optional)"
              />
            </Field>
            <Field label="Last name" htmlFor="student-last_name" required>
              <input id="student-last_name" className="gf-input" name="last_name" defaultValue={student.last_name} required />
            </Field>
            <Field label="Date of birth" htmlFor="student-date_of_birth">
              <input
                id="student-date_of_birth"
                className="gf-input"
                name="date_of_birth"
                type="date"
                defaultValue={student.date_of_birth ?? ""}
              />
            </Field>
            <Field label="Admission number" htmlFor="student-admission_number">
              <input
                id="student-admission_number"
                className="gf-input"
                name="admission_number"
                defaultValue={student.admission_number ?? ""}
                placeholder="(optional)"
              />
            </Field>
            <Field label="Status" htmlFor="student-status" required>
              <select id="student-status" className="gf-select" name="status" required defaultValue={student.status}>
                <option value="applied">Applied</option>
                <option value="enrolled">Enrolled</option>
                <option value="active">Active</option>
                <option value="graduated">Graduated</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="transferred">Transferred</option>
              </select>
            </Field>
            <Field label="Level" htmlFor="student-level" required>
              <select id="student-level" className="gf-select" name="level" required defaultValue={student.level}>
                <option value="creche">Creche</option>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
            </Field>
            <Field label="Class" htmlFor="student-class_id">
              <select id="student-class_id" className="gf-select" name="class_id" defaultValue={student.class_id ?? ""}>
                <option value="">(none)</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </FormSection>
      </form>
      ) : (
        <Card>
          <CardHeader title="Student details" />
          <CardBody className="space-y-5">
            <Alert tone="info">Only admins can edit student details.</Alert>
            <DetailList
              items={[
                { label: "First name", value: student.first_name },
                { label: "Middle name", value: student.middle_name },
                { label: "Last name", value: student.last_name },
                { label: "Date of birth", value: student.date_of_birth ? formatLagosDate(student.date_of_birth) : null },
                { label: "Admission number", value: student.admission_number },
                { label: "Status", value: capitalize(student.status) },
                { label: "Level", value: capitalize(student.level) },
                { label: "Class", value: currentClassName }
              ]}
            />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="Linked guardians" description="Parents and guardians connected to this student." />
        {linked.length ? (
          <ul className="divide-y divide-slate-100">
            {linked.map((g) => (
              <li key={g.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={g.full_name} size="md" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">{g.full_name}</span>
                      {g.is_primary ? <Badge tone="green">Primary</Badge> : null}
                    </div>
                    <div className="mt-0.5 text-sm text-slate-600">
                      {g.relationship ? `Relationship: ${g.relationship}` : "Relationship: —"}
                    </div>
                    <div className="mt-0.5 break-words text-xs text-slate-500">
                      {g.email ?? "—"} {g.phone ? ` • ${g.phone}` : ""}
                    </div>
                  </div>
                </div>
                <form action={removeGuardian} className="shrink-0">
                  <input type="hidden" name="guardian_id" value={g.id} />
                  <ConfirmSubmitButton
                    confirmMessage={`Unlink ${g.full_name} from ${student.first_name} ${student.last_name}?`}
                    className={buttonClasses({
                      variant: "secondary",
                      size: "sm",
                      className: "text-red-600 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    })}
                  >
                    <UserMinus className="h-4 w-4" aria-hidden="true" />
                    Remove
                  </ConfirmSubmitButton>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Users}
            title="No guardians linked yet"
            description="Link a parent or guardian below so they appear on this student's record."
          />
        )}
      </Card>

      <form action={addGuardian}>
        <FormSection
          title="Link a guardian"
          description="Choose an existing guardian record to connect to this student."
          footer={
            <SubmitButton variant="primary" pendingText="Linking…" disabled={!availableGuardians.length}>
              Link guardian
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Guardian" htmlFor="guardian_id">
              <select
                id="guardian_id"
                className="gf-select"
                name="guardian_id"
                required
                defaultValue=""
                disabled={!availableGuardians.length}
              >
                <option value="" disabled>
                  {availableGuardians.length ? "Select a guardian" : "No available guardians"}
                </option>
                {availableGuardians.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.full_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Relationship" htmlFor="relationship">
              <input id="relationship" className="gf-input" name="relationship" placeholder="e.g. Mother, Father, Guardian" />
            </Field>
            <label htmlFor="is_primary" className="flex items-center gap-2.5 text-sm font-medium text-slate-700 sm:col-span-2">
              <input className="gf-checkbox" name="is_primary" type="checkbox" id="is_primary" />
              Primary guardian
            </label>
          </div>
        </FormSection>
      </form>

      {isAdmin && app ? (
        <Card>
          <CardHeader
            title="Admissions bio"
            description="Pulled from the original application."
            action={
              <Link className="gf-link inline-flex items-center gap-1 text-sm" href={`/admin/students/applications/${app.id}`}>
                View application
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          <CardBody className="space-y-6">
            <DetailList
              items={[
                {
                  label: "Student name",
                  value: `${String(app.data.first_name ?? student.first_name)} ${String(app.data.middle_name ?? student.middle_name ?? "")} ${String(app.data.last_name ?? student.last_name)}`
                },
                { label: "DOB", value: String(app.data.dob ?? student.date_of_birth ?? "—") },
                { label: "Sex", value: String(app.data.sex ?? student.sex ?? "—") },
                { label: "Religion", value: String(app.data.religion ?? student.religion ?? "—") },
                { label: "Seeking admission into", value: String(app.data.seeking_class ?? "—") },
                { label: "Passport photo URL", value: String(app.data.passport_photo_url ?? "—") },
                { label: "Favorite sports", value: String(app.data.favorite_sports ?? "—") },
                { label: "Future aspiration", value: String(app.data.future_aspiration ?? "—") },
                { label: "Hobbies", value: String(app.data.hobbies ?? "—") },
                { label: "Child is with", value: String(app.data.child_with ?? "—") }
              ]}
            />
            <div className="border-t border-slate-100 pt-6">
              <DetailList
                items={[
                  {
                    label: "Referral",
                    node: (
                      <>
                        <span className="block">{String(app.data.referred ?? "—")}</span>
                        <span className="block font-normal text-slate-600">
                          {String(app.data.referrer_name ?? "—")} • {String(app.data.referrer_ref ?? "—")}
                        </span>
                      </>
                    )
                  },
                  { label: "Discovery", value: String(app.data.discovery_source ?? "—") },
                  { label: "Pickup details", value: String(app.data.pickup_details ?? "—"), wide: true, multiline: true },
                  {
                    label: "Student signature",
                    node: (
                      <>
                        <span className="block">{String(app.data.student_signature_name ?? "—")}</span>
                        <span className="block text-xs font-normal text-slate-500">
                          {String(app.data.student_signature_date ?? "—")}
                        </span>
                      </>
                    )
                  },
                  {
                    label: "Parent signature",
                    node: (
                      <>
                        <span className="block">{String(app.data.parent_signature_name ?? "—")}</span>
                        <span className="block text-xs font-normal text-slate-500">
                          {String(app.data.parent_signature_date ?? "—")}
                        </span>
                      </>
                    )
                  }
                ]}
              />
            </div>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );

  const sideColumn = isAdmin ? (
    <div className="space-y-6">
      {existingPortalUserId ? (
        <form action={resetPortalPassword}>
          <input type="hidden" name="user_id" value={existingPortalUserId} />
          <FormSection
            title="Portal account"
            description="Students sign in using admission number and password."
            footer={
              <SubmitButton variant="primary" pendingText="Saving…">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                Reset portal password
              </SubmitButton>
            }
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Badge tone="green" dot>
                  Active
                </Badge>
                Portal account exists
              </div>
              <PasswordInput id="portal-new-password" label="New password" name="password" minLength={8} required />
              <p className="gf-hint">At least 8 characters.</p>
            </div>
          </FormSection>
        </form>
      ) : (
        <form action={createPortalAccount}>
          <input type="hidden" name="student_first_name" value={student.first_name} />
          <input type="hidden" name="student_last_name" value={student.last_name} />
          <FormSection
            title="Portal account"
            description="Students sign in using admission number and password."
            footer={
              <SubmitButton variant="primary" pendingText="Creating…">
                Create portal account
              </SubmitButton>
            }
          >
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Badge tone="slate">Not set up</Badge>
                No portal account yet
              </div>
              <Field label="Admission number" htmlFor="portal-admission_number">
                <input
                  id="portal-admission_number"
                  className="gf-input"
                  name="admission_number"
                  defaultValue={student.admission_number ?? ""}
                  required
                />
              </Field>
              <div>
                <PasswordInput id="portal-password" label="Password" name="password" minLength={8} required />
                <p className="gf-hint">At least 8 characters.</p>
              </div>
            </div>
          </FormSection>
        </form>
      )}

      <FormSection title="Profile" description="Profile enrichment fields (admin-managed).">
        <div className="space-y-5">
          <StudentPhotoUploader studentId={studentId} initialUrl={student.profile_photo_url ?? null} saveAction={saveStudentPhoto} />
          <form action={updateStudentProfile} className="space-y-4 border-t border-slate-100 pt-5">
            <Field label="Profile photo URL (optional)" htmlFor="profile_photo_url">
              <input
                id="profile_photo_url"
                className="gf-input"
                name="profile_photo_url"
                defaultValue={student.profile_photo_url ?? ""}
                placeholder="https://..."
              />
            </Field>
            <Field label="Hobbies" htmlFor="hobbies" hint="Separate with commas.">
              <input
                id="hobbies"
                className="gf-input"
                name="hobbies"
                defaultValue={(student.hobbies ?? []).join(", ")}
                placeholder="e.g. Chess, Reading, Football"
              />
            </Field>
            <div className="flex justify-end">
              <SubmitButton variant="secondary" pendingText="Saving…">
                Save profile
              </SubmitButton>
            </div>
          </form>
        </div>
      </FormSection>
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      <UrlToast key={toastKey} />
      <PageHeader back={BACK} eyebrow="Student" title={fullName} />

      <Card>
        <CardBody className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <Avatar name={fullName} src={student.profile_photo_url} size="xl" />
          <dl className="grid flex-1 grid-cols-2 gap-x-6 gap-y-4 lg:grid-cols-5">
            <div>
              <dt className="text-xs font-medium text-slate-500">Status</dt>
              <dd className="mt-1">
                <Badge tone={studentStatusTone(student.status)} dot>
                  {capitalize(student.status)}
                </Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Level</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">{capitalize(student.level)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Class</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">{currentClassName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Admission number</dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold text-slate-900">{student.admission_number ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium text-slate-500">Date of birth</dt>
              <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                {student.date_of_birth ? formatLagosDate(student.date_of_birth) : "—"}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      {sideColumn ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">{mainColumn}</div>
          <div>{sideColumn}</div>
        </div>
      ) : (
        mainColumn
      )}
    </div>
  );
}
