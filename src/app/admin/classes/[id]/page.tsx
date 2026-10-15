import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { GraduationCap, UserMinus, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

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
    if (!supabase) {
      redirect(`/admin/classes/${id}?toast=${encodeURIComponent("Server error — Supabase is not configured")}&toast_type=error`);
    }

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

  const field = "gf-input px-2.5 py-1.5";
  const selectField = "gf-select py-1.5 pl-2.5";
  const title = isUnassigned ? "Students without a class" : `${cls!.level} - ${cls!.name}`;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/classes", label: "All classes" }}
        eyebrow="Classes"
        title={<span className="capitalize">{title}</span>}
        description={
          canEdit
            ? "Fix a wrongly registered child by editing the row and pressing Save. Change the class to move them."
            : "Only admins can edit student details."
        }
        actions={
          !isUnassigned ? (
            <>
              <ButtonLink href={`/admin/students?class_id=${id}`} variant="secondary" size="sm">
                <Users className="h-4 w-4" aria-hidden="true" />
                Open in Students list
              </ButtonLink>
              <ButtonLink href={`/admin/finance/debtors?class_id=${id}`} variant="secondary" size="sm">
                <Wallet className="h-4 w-4" aria-hidden="true" />
                Fees owed by this class
              </ButtonLink>
            </>
          ) : undefined
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Current students"
          value={currentCount}
          hint="Active or enrolled"
          icon={GraduationCap}
          tone="green"
        />
        <StatCard
          label="Past / other"
          value={students.length - currentCount}
          hint="Graduated, withdrawn, transferred or applied"
          icon={UserMinus}
          tone="slate"
        />
      </div>

      <Card>
        <CardHeader
          title="Students"
          description={`${currentCount} current student${currentCount === 1 ? "" : "s"}${
            students.length > currentCount ? ` · ${students.length - currentCount} past/other` : ""
          }.`}
        />
        {students.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[960px]">
              <thead>
                <tr>
                  <th className="w-10">#</th>
                  <th>Last name</th>
                  <th>First name</th>
                  <th>Middle name</th>
                  <th>Admission no.</th>
                  <th>Class</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s, i) => {
                  const formId = `student-${s.id}`;
                  const isCurrent = currentStatuses.has(s.status);
                  return (
                    <tr key={s.id} className={isCurrent ? "" : "bg-slate-50/60 text-slate-500"}>
                      <td className="text-xs text-slate-500">{i + 1}</td>
                      <td>
                        <input
                          form={formId}
                          className={field}
                          name="last_name"
                          aria-label="Last name"
                          defaultValue={s.last_name}
                          disabled={!canEdit}
                          required
                        />
                      </td>
                      <td>
                        <input
                          form={formId}
                          className={field}
                          name="first_name"
                          aria-label="First name"
                          defaultValue={s.first_name}
                          disabled={!canEdit}
                          required
                        />
                      </td>
                      <td>
                        <input
                          form={formId}
                          className={field}
                          name="middle_name"
                          aria-label="Middle name"
                          defaultValue={s.middle_name ?? ""}
                          disabled={!canEdit}
                        />
                      </td>
                      <td>
                        <input
                          form={formId}
                          className={field}
                          name="admission_number"
                          aria-label="Admission number"
                          defaultValue={s.admission_number ?? ""}
                          disabled={!canEdit}
                        />
                      </td>
                      <td>
                        <select
                          form={formId}
                          className={selectField}
                          name="class_id"
                          aria-label="Class"
                          defaultValue={s.class_id ?? ""}
                          disabled={!canEdit}
                        >
                          <option value="">— No class</option>
                          {classOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.level} - {c.name}
                              {c.active ? "" : " (inactive)"}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          form={formId}
                          className={selectField}
                          name="status"
                          aria-label="Status"
                          defaultValue={s.status}
                          disabled={!canEdit}
                        >
                          {statuses.map((st) => (
                            <option key={st} value={st}>
                              {st}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-2">
                          {canEdit ? (
                            <form id={formId} action={updateStudentRow}>
                              <input type="hidden" name="student_id" value={s.id} />
                              <SubmitButton variant="primary" size="sm" pendingText="Saving…" showSpinner={false}>
                                Save
                              </SubmitButton>
                            </form>
                          ) : null}
                          <Link className="gf-link text-xs" href={`/admin/students/${s.id}`}>
                            Profile
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Users} title="No students in this class yet." />
        )}
      </Card>
    </div>
  );
}
