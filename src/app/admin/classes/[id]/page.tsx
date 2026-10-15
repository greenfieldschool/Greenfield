import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";

type ClassRow = { id: string; level: string; name: string; active: boolean };

type StudentRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  admission_number: string | null;
  class_id: string | null;
  status: string;
};

const UNASSIGNED = "unassigned";
const statuses = ["active", "enrolled", "applied", "graduated", "withdrawn", "transferred"] as const;
const currentStatuses = new Set(["active", "enrolled"]);
const levelOrder: Record<string, number> = { creche: 0, primary: 1, secondary: 2 };

export default async function AdminClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const isUnassigned = id === UNASSIGNED;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: me } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };
  const canEdit = me?.role === "super_admin" || me?.role === "admin";

  let studentsQuery = supabase
    .from("students")
    .select("id, first_name, middle_name, last_name, admission_number, class_id, status")
    .order("last_name", { ascending: true })
    .order("first_name", { ascending: true });
  studentsQuery = isUnassigned
    ? studentsQuery.is("class_id", null).in("status", Array.from(currentStatuses))
    : studentsQuery.eq("class_id", id);

  const [{ data: classData }, { data: allClasses }, { data: studentData }] = await Promise.all([
    isUnassigned
      ? Promise.resolve({ data: null })
      : supabase.from("classes").select("id, level, name, active").eq("id", id).maybeSingle(),
    supabase.from("classes").select("id, level, name, active").order("level").order("name"),
    studentsQuery
  ]);

  const cls = (classData ?? null) as ClassRow | null;
  if (!isUnassigned && !cls) notFound();

  const classOptions = ((allClasses ?? []) as ClassRow[]).sort(
    (a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9) || a.name.localeCompare(b.name)
  );

  const students = ((studentData ?? []) as StudentRow[]).sort((a, b) => Number(currentStatuses.has(b.status)) - Number(currentStatuses.has(a.status)));
  const currentCount = students.filter((s) => currentStatuses.has(s.status)).length;

  async function updateStudentRow(formData: FormData) {
    "use server";

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();
    const { data: me } = user
      ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
      : { data: null };
    if (me?.role !== "super_admin" && me?.role !== "admin") {
      redirect(`/admin/classes/${id}?toast=${encodeURIComponent("Only admins can edit student details")}&toast_type=error`);
    }

    const studentId = String(formData.get("student_id") ?? "").trim();
    const firstName = String(formData.get("first_name") ?? "").trim();
    const middleName = String(formData.get("middle_name") ?? "").trim();
    const lastName = String(formData.get("last_name") ?? "").trim();
    const admissionNumber = String(formData.get("admission_number") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();
    const status = String(formData.get("status") ?? "").trim();

    if (!studentId || !firstName || !lastName || !(statuses as readonly string[]).includes(status)) {
      redirect(`/admin/classes/${id}?toast=${encodeURIComponent("First name, last name and status are required")}&toast_type=error`);
    }

    const update: Record<string, string | null> = {
      first_name: firstName,
      middle_name: middleName.length ? middleName : null,
      last_name: lastName,
      admission_number: admissionNumber.length ? admissionNumber : null,
      class_id: classId.length ? classId : null,
      status
    };

    // Keep the student's level in step with the class they are moved to.
    if (classId) {
      const { data: target } = await supabase.from("classes").select("level").eq("id", classId).maybeSingle();
      if (target?.level) update.level = target.level as string;
    }

    const { error } = await supabase.from("students").update(update).eq("id", studentId);
    if (error) {
      redirect(`/admin/classes/${id}?toast=${encodeURIComponent(error.message)}&toast_type=error`);
    }

    revalidatePath("/admin/classes");
    revalidatePath(`/admin/classes/${id}`);
    if (classId) revalidatePath(`/admin/classes/${classId}`);
    revalidatePath("/admin/students");
    revalidatePath(`/admin/students/${studentId}`);

    const moved = classId !== (id === UNASSIGNED ? "" : id);
    redirect(
      `/admin/classes/${id}?toast=${encodeURIComponent(
        moved ? `${firstName} ${lastName} saved and moved to another class` : `${firstName} ${lastName} saved`
      )}&toast_type=success`
    );
  }

  const field =
    "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-green disabled:bg-slate-50 disabled:text-slate-600";

  return (
    <div className="space-y-6">
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Classes</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">
          {isUnassigned ? "Students without a class" : `${cls!.level} - ${cls!.name}`}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {currentCount} current student{currentCount === 1 ? "" : "s"}
          {students.length > currentCount ? ` · ${students.length - currentCount} past/other` : ""}.{" "}
          {canEdit
            ? "Fix a wrongly registered child by editing the row and pressing Save. Change the class to move them."
            : "Only admins can edit student details."}
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link className="font-semibold text-brand-green hover:underline" href="/admin/classes">
            All classes
          </Link>
          {!isUnassigned ? (
            <>
              <Link className="font-semibold text-brand-green hover:underline" href={`/admin/students?class_id=${id}`}>
                Open in Students list
              </Link>
              <Link className="font-semibold text-brand-green hover:underline" href={`/admin/finance/debtors?class_id=${id}`}>
                Fees owed by this class
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-2 py-3 text-left">Last name</th>
                <th className="px-2 py-3 text-left">First name</th>
                <th className="px-2 py-3 text-left">Middle name</th>
                <th className="px-2 py-3 text-left">Admission no.</th>
                <th className="px-2 py-3 text-left">Class</th>
                <th className="px-2 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {students.length ? (
                students.map((s, i) => {
                  const formId = `student-${s.id}`;
                  const isCurrent = currentStatuses.has(s.status);
                  return (
                    <tr key={s.id} className={`border-t border-slate-200 ${isCurrent ? "" : "bg-slate-50/60 text-slate-500"}`}>
                      <td className="px-4 py-2 text-xs text-slate-500">{i + 1}</td>
                      <td className="px-2 py-2">
                        <input form={formId} className={field} name="last_name" defaultValue={s.last_name} disabled={!canEdit} required />
                      </td>
                      <td className="px-2 py-2">
                        <input form={formId} className={field} name="first_name" defaultValue={s.first_name} disabled={!canEdit} required />
                      </td>
                      <td className="px-2 py-2">
                        <input form={formId} className={field} name="middle_name" defaultValue={s.middle_name ?? ""} disabled={!canEdit} />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          form={formId}
                          className={field}
                          name="admission_number"
                          defaultValue={s.admission_number ?? ""}
                          disabled={!canEdit}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <select form={formId} className={field} name="class_id" defaultValue={s.class_id ?? ""} disabled={!canEdit}>
                          <option value="">— No class</option>
                          {classOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.level} - {c.name}
                              {c.active ? "" : " (inactive)"}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-2">
                        <select form={formId} className={field} name="status" defaultValue={s.status} disabled={!canEdit}>
                          {statuses.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-3">
                          {canEdit ? (
                            <form id={formId} action={updateStudentRow}>
                              <input type="hidden" name="student_id" value={s.id} />
                              <SubmitButton
                                className="rounded-lg bg-brand-green px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-60"
                                pendingText="Saving…"
                                showSpinner={false}
                              >
                                Save
                              </SubmitButton>
                            </form>
                          ) : null}
                          <Link className="text-xs font-semibold text-brand-green hover:underline" href={`/admin/students/${s.id}`}>
                            Profile
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-sm text-slate-600">
                    No students in this class yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
