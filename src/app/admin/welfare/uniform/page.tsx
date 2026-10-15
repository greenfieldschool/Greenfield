import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import { fetchAllRows } from "@/lib/fetch-all";
import { CheckCircle2, Plus, Shirt, Trash2, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { deleteLinkClasses, welfareBack } from "../_ui";

type StudentRow = { id: string; first_name: string; last_name: string };
type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type UniformRow = {
  id: string;
  student_id: string;
  date: string;
  ok: boolean;
  notes: string | null;
};

export default async function AdminWelfareUniformPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: studentsData }, { data: years }, { data: terms }, { data: checks }] = await Promise.all([
    fetchAllRows<StudentRow>(() =>
      supabase
        .from("students")
        .select("id, first_name, last_name")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .order("id", { ascending: true })
    ).then((data) => ({ data })),
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false }),
    supabase
      .from("student_uniform_checks")
      .select("id, student_id, date, ok, notes")
      .order("date", { ascending: false })
      .limit(200)
  ]);

  const students = (studentsData ?? []) as StudentRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const uniformRows = (checks ?? []) as UniformRow[];

  const studentById = new Map(students.map((s) => [s.id, s] as const));

  async function upsertCheck(formData: FormData) {
    "use server";
    const PATH = "/admin/welfare/uniform";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const date = String(formData.get("date") ?? "").trim();
    const ok = String(formData.get("ok") ?? "").trim() === "true";
    const notes = String(formData.get("notes") ?? "").trim();

    if (!studentId || !date) welfareBack(PATH, "Choose a student and a date", "error");

    const supabase = getSupabaseServerClient();
    if (!supabase) welfareBack(PATH, "Database is not configured", "error");

    const { error } = await supabase.from("student_uniform_checks").upsert(
      {
        student_id: studentId,
        academic_year_id: yearIdRaw.length ? yearIdRaw : null,
        academic_term_id: termIdRaw.length ? termIdRaw : null,
        date,
        ok,
        notes: notes.length ? notes : null
      },
      { onConflict: "student_id,date" }
    );

    revalidatePath(PATH);
    if (error) welfareBack(PATH, error.message, "error");
    welfareBack(PATH, "Uniform check saved");
  }

  async function deleteCheck(formData: FormData) {
    "use server";
    const PATH = "/admin/welfare/uniform";

    const id = String(formData.get("id") ?? "").trim();
    if (!id) welfareBack(PATH, "Missing check", "error");

    const supabase = getSupabaseServerClient();
    if (!supabase) welfareBack(PATH, "Database is not configured", "error");

    const { error } = await supabase.from("student_uniform_checks").delete().eq("id", id);
    revalidatePath(PATH);
    if (error) welfareBack(PATH, error.message, "error");
    welfareBack(PATH, "Check deleted");
  }

  const okCount = uniformRows.filter((u) => u.ok).length;
  const notOkCount = uniformRows.length - okCount;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Welfare"
        title="Uniform checks"
        description="Record dressing/uniform compliance."
        actions={
          <a href="#new-check" className={buttonClasses({ variant: "primary" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New check
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Checks" value={uniformRows.length} hint="Most recent 200" icon={Shirt} tone="slate" />
        <StatCard label="Compliant" value={okCount} hint="Uniform OK" icon={CheckCircle2} tone="green" />
        <StatCard label="Not compliant" value={notOkCount} hint="Needs follow-up" icon={XCircle} tone="rose" />
      </div>

      <Card>
        <CardHeader title="Recent checks" description="Newest first." />
        {uniformRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[640px]">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Date</th>
                  <th scope="col">OK</th>
                  <th scope="col">Notes</th>
                  <th scope="col" className="text-right">
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {uniformRows.map((u) => {
                  const s = studentById.get(u.student_id) ?? null;
                  return (
                    <tr key={u.id}>
                      <td className="font-semibold text-slate-900">{s ? `${s.first_name} ${s.last_name}` : u.student_id}</td>
                      <td className="whitespace-nowrap">{u.date}</td>
                      <td>
                        {u.ok ? (
                          <Badge tone="green" dot>
                            Yes
                          </Badge>
                        ) : (
                          <Badge tone="red" dot>
                            No
                          </Badge>
                        )}
                      </td>
                      <td className="max-w-xs">
                        <p className="truncate text-slate-600" title={u.notes ?? ""}>
                          {u.notes ?? "—"}
                        </p>
                      </td>
                      <td className="text-right">
                        <form action={deleteCheck}>
                          <input type="hidden" name="id" value={u.id} />
                          <ConfirmSubmitButton className={deleteLinkClasses} confirmMessage="Delete this uniform check? This cannot be undone.">
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            Delete
                          </ConfirmSubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Shirt} title="No uniform checks yet" description="Checks you save below will appear here." />
        )}
      </Card>

      <form action={upsertCheck} id="new-check" className="scroll-mt-24">
        <FormSection
          title="New check"
          description="Saving a check for the same student and date replaces the earlier one."
          footer={
            <SubmitButton variant="primary" pendingText="Saving…">
              Save check
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Student" htmlFor="uni-student" required>
              <select id="uni-student" className="gf-select" name="student_id" defaultValue="" required>
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Date" htmlFor="uni-date" required>
              <input id="uni-date" className="gf-input" name="date" type="date" required />
            </Field>
            <Field label="Academic year" htmlFor="uni-year" hint="Optional">
              <select id="uni-year" className="gf-select" name="academic_year_id" defaultValue="">
                <option value="">—</option>
                {yearRows.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic term" htmlFor="uni-term" hint="Optional">
              <select id="uni-term" className="gf-select" name="academic_term_id" defaultValue="">
                <option value="">—</option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Uniform OK?" htmlFor="uni-ok">
              <select id="uni-ok" className="gf-select" name="ok" defaultValue="true">
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </Field>
            <Field label="Notes" htmlFor="uni-notes" hint="Optional">
              <input id="uni-notes" className="gf-input" name="notes" placeholder="(optional)" />
            </Field>
          </div>
        </FormSection>
      </form>
    </div>
  );
}
