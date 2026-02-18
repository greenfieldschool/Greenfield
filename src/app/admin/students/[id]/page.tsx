import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string | null;
  profile_photo_url: string | null;
  hobbies: string[];
  level: string;
  class_id: string | null;
  classes: Array<{ id: string; level: string; name: string }>;
  status: string;
  date_of_birth: string | null;
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
      .select(
        "id, first_name, last_name, admission_number, profile_photo_url, hobbies, level, class_id, status, date_of_birth, classes(id, level, name)"
      )
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

  const {
    data: { user: currentUser }
  } = await supabase.auth.getUser();

  const { data: currentUserProfile } = currentUser
    ? await supabase.from("profiles").select("role").eq("id", currentUser.id).maybeSingle()
    : { data: null as { role?: string | null } | null };

  const currentRole = (currentUserProfile?.role ?? null) as string | null;
  const isAdmin = currentRole === "super_admin" || currentRole === "admin";

  async function updateStudent(formData: FormData) {
    "use server";

    const admissionNumber = String(formData.get("admission_number") ?? "").trim();
    const level = String(formData.get("level") ?? "").trim();
    const classIdRaw = String(formData.get("class_id") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    if (!level || !status) return;

    const classId = classIdRaw.length ? classIdRaw : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("students")
      .update({
        admission_number: admissionNumber.length ? admissionNumber : null,
        level,
        class_id: classId,
        status
      })
      .eq("id", studentId);

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
            <h2 className="text-base font-semibold text-slate-900">Profile</h2>
            <p className="mt-1 text-sm text-slate-600">Profile enrichment fields (admin-managed).</p>
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
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6">
          <h2 className="text-base font-semibold text-slate-900">Edit student</h2>
          <form action={updateStudent} className="mt-4 grid gap-4 sm:grid-cols-2">
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
