import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import StudentPhotoUploader from "./StudentPhotoUploader";

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
  params
}: {
  params: { id: string };
}) {
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
      redirect(`/admin/students/${studentId}?portal_error=1`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      redirect(`/admin/students/${studentId}?portal_error=1`);
    }

    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (me?.role ?? null) as string | null;
    const isAllowed = role === "super_admin" || role === "admin";
    if (!isAllowed) {
      redirect(`/admin/students/${studentId}?portal_error=1`);
    }

    const service = getSupabaseServiceClient();
    if (!service) {
      redirect(`/admin/students/${studentId}?portal_error=service`);
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
      redirect(`/admin/students/${studentId}?portal_error=1`);
    }

    await service
      .from("profiles")
      .update({ role: "student", email, full_name: studentFullName.length ? studentFullName : null })
      .eq("id", created.user.id);

    await service.from("student_user_links").upsert(
      {
        user_id: created.user.id,
        student_id: studentId
      },
      { onConflict: "user_id" }
    );

    revalidatePath(`/admin/students/${studentId}`);
    redirect(`/admin/students/${studentId}?portal_created=1`);
  }

  async function resetPortalPassword(formData: FormData) {
    "use server";

    const password = String(formData.get("password") ?? "").trim();
    const userId = String(formData.get("user_id") ?? "").trim();

    if (!userId || password.length < 8) {
      redirect(`/admin/students/${studentId}?portal_error=1`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();
    if (!user) {
      redirect(`/admin/students/${studentId}?portal_error=1`);
    }

    const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const role = (me?.role ?? null) as string | null;
    const isAllowed = role === "super_admin" || role === "admin";
    if (!isAllowed) {
      redirect(`/admin/students/${studentId}?portal_error=1`);
    }

    const service = getSupabaseServiceClient();
    if (!service) {
      redirect(`/admin/students/${studentId}?portal_error=service`);
    }

    const { error } = await service.auth.admin.updateUserById(userId, { password });
    if (error) {
      redirect(`/admin/students/${studentId}?portal_error=1`);
    }

    revalidatePath(`/admin/students/${studentId}`);
    redirect(`/admin/students/${studentId}?portal_reset=1`);
  }

  async function updateStudent(formData: FormData) {
    "use server";

    if (!isAdmin) return;

    const firstName = String(formData.get("first_name") ?? "").trim();
    const middleName = String(formData.get("middle_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    const dateOfBirthRaw = String(formData.get("date_of_birth") ?? "").trim();
    const admissionNumber = String(formData.get("admission_number") ?? "").trim();
    const level = String(formData.get("level") ?? "").trim();
    const classIdRaw = String(formData.get("class_id") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    if (!firstName || !lastName || !level || !status) return;

    const classId = classIdRaw.length ? classIdRaw : null;
    const dateOfBirth = dateOfBirthRaw.length ? dateOfBirthRaw : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
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

    revalidatePath(`/admin/students/${studentId}`);
    revalidatePath("/admin/students");
  }

  async function saveStudentPhoto(formData: FormData) {
    "use server";

    if (!isAdmin) return;

    const photoUrlRaw = String(formData.get("profile_photo_url") ?? "").trim();
    const profilePhotoUrl = photoUrlRaw.length ? photoUrlRaw : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("students").update({ profile_photo_url: profilePhotoUrl }).eq("id", studentId);

    revalidatePath(`/admin/students/${studentId}`);
    revalidatePath("/admin/students");
  }

  async function updateStudentProfile(formData: FormData) {
    "use server";

    if (!isAdmin) return;

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
    if (!supabase) return;

    await supabase
      .from("students")
      .update({ profile_photo_url: profilePhotoUrl, hobbies })
      .eq("id", studentId);

    revalidatePath(`/admin/students/${studentId}`);
    revalidatePath("/admin/students");
  }

  async function addGuardian(formData: FormData) {
    "use server";

    const guardianId = String(formData.get("guardian_id") ?? "").trim();
    const relationship = String(formData.get("relationship") ?? "").trim();
    const isPrimary = formData.get("is_primary") === "on";

    if (!guardianId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("student_guardians").insert({
      student_id: studentId,
      guardian_id: guardianId,
      relationship: relationship.length ? relationship : null,
      is_primary: isPrimary
    });

    revalidatePath(`/admin/students/${studentId}`);
  }

  async function removeGuardian(formData: FormData) {
    "use server";

    const guardianId = String(formData.get("guardian_id") ?? "").trim();
    if (!guardianId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("student_guardians")
      .delete()
      .eq("student_id", studentId)
      .eq("guardian_id", guardianId);

    revalidatePath(`/admin/students/${studentId}`);
  }

  if (!student) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Student not found</h1>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-slate-900 hover:text-slate-700" href="/admin/students">
            Back to students
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Student</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {student.first_name} {student.last_name}
        </h1>
        {isAdmin ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-base font-semibold text-slate-900">Portal account</h2>
            <p className="mt-1 text-sm text-slate-600">Students sign in using admission number and password.</p>

            {existingPortalUserId ? (
              <form action={resetPortalPassword} className="mt-4 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="user_id" value={existingPortalUserId} />
                <div className="sm:col-span-2">
                  <label className="text-sm font-semibold text-slate-900">New password</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    name="password"
                    type="password"
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex items-end">
                  <button
                    className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                    type="submit"
                  >
                    Reset portal password
                  </button>
                </div>
              </form>
            ) : (
              <form action={createPortalAccount} className="mt-4 grid gap-4 sm:grid-cols-2">
                <input type="hidden" name="student_first_name" value={student.first_name} />
                <input type="hidden" name="student_last_name" value={student.last_name} />
                <div>
                  <label className="text-sm font-semibold text-slate-900">Admission number</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    name="admission_number"
                    defaultValue={student.admission_number ?? ""}
                    required
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Password</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    name="password"
                    type="password"
                    minLength={8}
                    required
                  />
                </div>
                <div className="flex items-end">
                  <button
                    className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                    type="submit"
                  >
                    Create portal account
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : null}
        {isAdmin ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <h2 className="text-base font-semibold text-slate-900">Profile</h2>
            <p className="mt-1 text-sm text-slate-600">Profile enrichment fields (admin-managed).</p>
            <div className="mt-4">
              <StudentPhotoUploader studentId={studentId} initialUrl={student.profile_photo_url ?? null} saveAction={saveStudentPhoto} />
            </div>
            <form action={updateStudentProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Profile photo URL (optional)</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="profile_photo_url"
                  defaultValue={student.profile_photo_url ?? ""}
                  placeholder="https://..."
                />
              </div>
              <div className="sm:col-span-2">
                <label className="text-sm font-semibold text-slate-900">Hobbies (comma separated)</label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                  name="hobbies"
                  defaultValue={(student.hobbies ?? []).join(", ")}
                  placeholder="e.g. Chess, Reading, Football"
                />
              </div>
              <div className="flex items-end">
                <button
                  className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                  type="submit"
                >
                  Save profile
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {isAdmin && admissionsApplication ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Admissions bio</h2>
                <p className="mt-1 text-sm text-slate-600">Pulled from the original application.</p>
              </div>
              <Link
                className="text-sm font-semibold text-brand-green hover:underline"
                href={`/admin/students/applications/${admissionsApplication.id}`}
              >
                View application
              </Link>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs font-semibold text-slate-500">Student name</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.first_name ?? student.first_name)} {String(admissionsApplication.data.middle_name ?? student.middle_name ?? "")} {String(admissionsApplication.data.last_name ?? student.last_name)}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">DOB</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.dob ?? student.date_of_birth ?? "—")}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Sex</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.sex ?? student.sex ?? "—")}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Religion</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.religion ?? student.religion ?? "—")}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Seeking admission into</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.seeking_class ?? "—")}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Passport photo URL</div>
                <div className="mt-1 break-words text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.passport_photo_url ?? "—")}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Favorite sports</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.favorite_sports ?? "—")}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Future aspiration</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.future_aspiration ?? "—")}
                </div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Hobbies</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{String(admissionsApplication.data.hobbies ?? "—")}</div>
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-500">Child is with</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{String(admissionsApplication.data.child_with ?? "—")}</div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Referral</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">{String(admissionsApplication.data.referred ?? "—")}</div>
                <div className="mt-2 text-sm text-slate-700">
                  {String(admissionsApplication.data.referrer_name ?? "—")} • {String(admissionsApplication.data.referrer_ref ?? "—")}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Discovery</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.discovery_source ?? "—")}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 md:col-span-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pickup details</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {String(admissionsApplication.data.pickup_details ?? "—")}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Student signature</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.student_signature_name ?? "—")}
                </div>
                <div className="mt-1 text-xs text-slate-600">{String(admissionsApplication.data.student_signature_date ?? "—")}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Parent signature</div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {String(admissionsApplication.data.parent_signature_name ?? "—")}
                </div>
                <div className="mt-1 text-xs text-slate-600">{String(admissionsApplication.data.parent_signature_date ?? "—")}</div>
              </div>
            </div>
          </div>
        ) : null}
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-base font-semibold text-slate-900">Edit student</h2>
          <form action={updateStudent} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-900">First name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="first_name"
                defaultValue={student.first_name}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Middle name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="middle_name"
                defaultValue={student.middle_name ?? ""}
                placeholder="(optional)"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Last name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="last_name"
                defaultValue={student.last_name}
                required
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Date of birth</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="date_of_birth"
                type="date"
                defaultValue={student.date_of_birth ?? ""}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Admission number</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="admission_number"
                defaultValue={student.admission_number ?? ""}
                placeholder="(optional)"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Level</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="level"
                required
                defaultValue={student.level}
              >
                <option value="creche">creche</option>
                <option value="primary">primary</option>
                <option value="secondary">secondary</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Class</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="class_id"
                defaultValue={student.class_id ?? ""}
              >
                <option value="">(none)</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Status</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                name="status"
                required
                defaultValue={student.status}
              >
                <option value="applied">applied</option>
                <option value="enrolled">enrolled</option>
                <option value="active">active</option>
                <option value="graduated">graduated</option>
                <option value="withdrawn">withdrawn</option>
                <option value="transferred">transferred</option>
              </select>
            </div>
            <div className="flex items-end">
              <button
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
                type="submit"
              >
                Save changes
              </button>
            </div>
          </form>
          <div className="mt-3 text-xs text-slate-600">
            Current class: {(student.classes ?? [])[0]?.name ?? "—"}
          </div>
        </div>
        <div className="mt-4 grid gap-3 text-sm text-slate-700 sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-slate-500">Level</div>
            <div className="mt-1 font-semibold text-slate-900">{student.level}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Admission number</div>
            <div className="mt-1 font-semibold text-slate-900">{student.admission_number ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Status</div>
            <div className="mt-1 font-semibold text-slate-900">{student.status}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500">Date of birth</div>
            <div className="mt-1 font-semibold text-slate-900">{student.date_of_birth ?? "—"}</div>
          </div>
        </div>
        <div className="mt-6">
          <Link className="text-sm font-semibold text-slate-900 hover:text-slate-700" href="/admin/students">
            Back to students
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Linked guardians</h2>
        <div className="mt-4 space-y-3">
          {linked.length ? (
            linked.map((g) => (
              <div
                key={g.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">{g.full_name}</div>
                  <div className="mt-1 text-sm text-slate-600">
                    {g.relationship ? `Relationship: ${g.relationship}` : "Relationship: —"}
                    {g.is_primary ? " • Primary" : ""}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {g.email ?? "—"} {g.phone ? ` • ${g.phone}` : ""}
                  </div>
                </div>
                <form action={removeGuardian}>
                  <input type="hidden" name="guardian_id" value={g.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Remove
                  </button>
                </form>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-600">No guardians linked yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Link a guardian</h2>
        <form action={addGuardian} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Guardian</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
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
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Relationship</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="relationship"
              placeholder="e.g. Mother, Father, Guardian"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              className="h-4 w-4 rounded border-slate-300"
              name="is_primary"
              type="checkbox"
              id="is_primary"
            />
            <label htmlFor="is_primary" className="text-sm font-semibold text-slate-900">
              Primary guardian
            </label>
          </div>
          <div className="flex items-end">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={!availableGuardians.length}
            >
              Link guardian
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
