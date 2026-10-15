import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import { fetchAllRows } from "@/lib/fetch-all";
import { AlertTriangle, CalendarDays, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SeverityBadge, deleteLinkClasses, shortDate, welfareBack } from "../_ui";
import { buttonClasses } from "@/components/ui/button";

type StudentRow = { id: string; first_name: string; last_name: string };
type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type DisciplineRow = {
  id: string;
  student_id: string;
  category: string | null;
  description: string;
  severity: number;
  occurred_at: string;
};

export default async function AdminWelfareDisciplinePage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: studentsData }, { data: years }, { data: terms }, { data: records }] = await Promise.all([
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
      .from("welfare_discipline_records")
      .select("id, student_id, category, description, severity, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(200)
  ]);

  const students = (studentsData ?? []) as StudentRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const disciplineRows = (records ?? []) as DisciplineRow[];

  const studentById = new Map(students.map((s) => [s.id, s] as const));

  async function createRecord(formData: FormData) {
    "use server";
    const PATH = "/admin/welfare/discipline";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const category = String(formData.get("category") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const severity = Number(String(formData.get("severity") ?? "1").trim() || "1");

    if (!studentId || !description) welfareBack(PATH, "Choose a student and enter a description", "error");
    if (!Number.isFinite(severity) || severity < 1 || severity > 5) {
      welfareBack(PATH, "Severity must be between 1 and 5", "error");
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) welfareBack(PATH, "Database is not configured", "error");

    const { error } = await supabase.from("welfare_discipline_records").insert({
      student_id: studentId,
      academic_year_id: yearIdRaw.length ? yearIdRaw : null,
      academic_term_id: termIdRaw.length ? termIdRaw : null,
      category: category.length ? category : null,
      description,
      severity
    });

    revalidatePath(PATH);
    if (error) welfareBack(PATH, error.message, "error");
    welfareBack(PATH, "Record created");
  }

  async function deleteRecord(formData: FormData) {
    "use server";
    const PATH = "/admin/welfare/discipline";

    const id = String(formData.get("id") ?? "").trim();
    if (!id) welfareBack(PATH, "Missing record", "error");

    const supabase = getSupabaseServerClient();
    if (!supabase) welfareBack(PATH, "Database is not configured", "error");

    const { error } = await supabase.from("welfare_discipline_records").delete().eq("id", id);
    revalidatePath(PATH);
    if (error) welfareBack(PATH, error.message, "error");
    welfareBack(PATH, "Record deleted");
  }

  const seriousCount = disciplineRows.filter((r) => r.severity >= 4).length;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthCount = disciplineRows.filter((r) => String(r.occurred_at).slice(0, 7) === thisMonth).length;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Welfare"
        title="Discipline"
        description="Record discipline cases and sanctions."
        actions={
          <a href="#new-record" className={buttonClasses({ variant: "primary" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New record
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Records" value={disciplineRows.length} hint="Most recent 200" icon={ShieldAlert} tone="slate" />
        <StatCard label="This month" value={monthCount} hint="Recorded this calendar month" icon={CalendarDays} tone="blue" />
        <StatCard label="Serious (4–5)" value={seriousCount} hint="High-severity cases" icon={AlertTriangle} tone="rose" />
      </div>

      <Card>
        <CardHeader title="Recent records" description="Newest first." />
        {disciplineRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[760px]">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Category</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Date</th>
                  <th scope="col">Notes</th>
                  <th scope="col" className="text-right">
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {disciplineRows.map((r) => {
                  const s = studentById.get(r.student_id) ?? null;
                  return (
                    <tr key={r.id}>
                      <td className="font-semibold text-slate-900">{s ? `${s.first_name} ${s.last_name}` : r.student_id}</td>
                      <td>{r.category ?? "—"}</td>
                      <td>
                        <SeverityBadge severity={r.severity} />
                      </td>
                      <td className="whitespace-nowrap">{shortDate(r.occurred_at)}</td>
                      <td className="max-w-xs">
                        <p className="line-clamp-2 text-slate-600" title={r.description}>
                          {r.description}
                        </p>
                      </td>
                      <td className="text-right">
                        <form action={deleteRecord}>
                          <input type="hidden" name="id" value={r.id} />
                          <ConfirmSubmitButton className={deleteLinkClasses} confirmMessage="Delete this discipline record? This cannot be undone.">
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
          <EmptyState icon={ShieldAlert} title="No discipline records yet" description="Records you create below will appear here." />
        )}
      </Card>

      <form action={createRecord} id="new-record" className="scroll-mt-24">
        <FormSection
          title="New record"
          description="Log a discipline case for a student."
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              Create record
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Student" htmlFor="dis-student" required>
              <select id="dis-student" className="gf-select" name="student_id" defaultValue="" required>
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category" htmlFor="dis-category" hint="Optional">
              <input id="dis-category" className="gf-input" name="category" placeholder="Late-coming, Fighting..." />
            </Field>
            <Field label="Academic year" htmlFor="dis-year" hint="Optional">
              <select id="dis-year" className="gf-select" name="academic_year_id" defaultValue="">
                <option value="">—</option>
                {yearRows.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic term" htmlFor="dis-term" hint="Optional">
              <select id="dis-term" className="gf-select" name="academic_term_id" defaultValue="">
                <option value="">—</option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" htmlFor="dis-description" required className="sm:col-span-2">
              <textarea id="dis-description" className="gf-input" name="description" rows={4} required />
            </Field>
            <Field label="Severity" htmlFor="dis-severity" hint="1 = minor, 5 = very serious" required>
              <input
                id="dis-severity"
                className="gf-input"
                name="severity"
                type="number"
                min={1}
                max={5}
                defaultValue={1}
                required
              />
            </Field>
          </div>
        </FormSection>
      </form>
    </div>
  );
}
