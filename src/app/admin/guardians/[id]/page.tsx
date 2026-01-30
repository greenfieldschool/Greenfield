import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type GuardianRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
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
    .select("id, full_name, email, phone")
    .eq("id", guardianId)
    .maybeSingle();

  const guardian = guardianData as GuardianRow | null;

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

  async function linkStudent(formData: FormData) {
    "use server";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const relationship = String(formData.get("relationship") ?? "").trim();
    const isPrimary = formData.get("is_primary") === "on";

    if (!studentId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("student_guardians").insert({
      student_id: studentId,
      guardian_id: guardianId,
      relationship: relationship.length ? relationship : null,
      is_primary: isPrimary
    });

    revalidatePath(`/admin/guardians/${guardianId}`);
  }

  async function unlinkStudent(formData: FormData) {
    "use server";

    const studentId = String(formData.get("student_id") ?? "").trim();
    if (!studentId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
      .from("student_guardians")
      .delete()
      .eq("student_id", studentId)
      .eq("guardian_id", guardianId);

    revalidatePath(`/admin/guardians/${guardianId}`);
  }

  if (!guardian) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Guardian not found</h1>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-slate-900 hover:text-slate-700" href="/admin/guardians">
            Back to guardians
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Guardian</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{guardian.full_name}</h1>
        <div className="mt-4 text-sm text-slate-700">
          <div>{guardian.email ?? "—"}</div>
          <div className="mt-1">{guardian.phone ?? "—"}</div>
        </div>
        <div className="mt-6">
          <Link className="text-sm font-semibold text-slate-900 hover:text-slate-700" href="/admin/guardians">
            Back to guardians
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Linked students</h2>
        <div className="mt-4 space-y-3">
          {linked.length ? (
            linked.map((s) => (
              <div
                key={s.id}
                className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-900">
                    {s.first_name} {s.last_name}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {s.level} • {s.status}
                    {s.relationship ? ` • Relationship: ${s.relationship}` : ""}
                    {s.is_primary ? " • Primary" : ""}
                  </div>
                </div>
                <form action={unlinkStudent}>
                  <input type="hidden" name="student_id" value={s.id} />
                  <button
                    type="submit"
                    className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  >
                    Unlink
                  </button>
                </form>
              </div>
            ))
          ) : (
            <div className="text-sm text-slate-600">No students linked yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Link a student</h2>
        <form action={linkStudent} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Student</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
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
            <input className="h-4 w-4 rounded border-slate-300" name="is_primary" type="checkbox" id="is_primary" />
            <label htmlFor="is_primary" className="text-sm font-semibold text-slate-900">
              Primary guardian
            </label>
          </div>
          <div className="flex items-end">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={!availableStudents.length}
            >
              Link student
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
