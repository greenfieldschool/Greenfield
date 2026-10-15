import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import { fetchAllRows } from "@/lib/fetch-all";
import { AlertTriangle, CalendarDays, HeartPulse, Plus, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SeverityBadge, deleteLinkClasses, pillButtonClasses, shortDate, welfareBack } from "../_ui";
import { buttonClasses } from "@/components/ui/button";

type StudentRow = { id: string; first_name: string; last_name: string; class_id: string | null };
type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };

type IncidentRow = {
  id: string;
  student_id: string;
  incident_type: string;
  description: string;
  severity: number;
  resolved: boolean;
  occurred_at: string;
};

export default async function AdminWelfareIncidentsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: studentsData }, { data: years }, { data: terms }, { data: incidents }] = await Promise.all([
    fetchAllRows<StudentRow>(() =>
      supabase
        .from("students")
        .select("id, first_name, last_name, class_id")
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true })
        .order("id", { ascending: true })
    ).then((data) => ({ data })),
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false }),
    supabase
      .from("welfare_incidents")
      .select("id, student_id, incident_type, description, severity, resolved, occurred_at")
      .order("occurred_at", { ascending: false })
      .limit(200)
  ]);

  const students = (studentsData ?? []) as StudentRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const incidentRows = (incidents ?? []) as IncidentRow[];

  const studentById = new Map(students.map((s) => [s.id, s] as const));

  async function createIncident(formData: FormData) {
    "use server";
    const PATH = "/admin/welfare/incidents";

    const studentId = String(formData.get("student_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const incidentType = String(formData.get("incident_type") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const severity = Number(String(formData.get("severity") ?? "1").trim() || "1");

    if (!studentId || !incidentType || !description) {
      welfareBack(PATH, "Choose a student and enter a type and description", "error");
    }
    if (!Number.isFinite(severity) || severity < 1 || severity > 5) {
      welfareBack(PATH, "Severity must be between 1 and 5", "error");
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) welfareBack(PATH, "Database is not configured", "error");

    const { error } = await supabase.from("welfare_incidents").insert({
      student_id: studentId,
      academic_year_id: yearIdRaw.length ? yearIdRaw : null,
      academic_term_id: termIdRaw.length ? termIdRaw : null,
      incident_type: incidentType,
      description,
      severity
    });

    revalidatePath(PATH);
    if (error) welfareBack(PATH, error.message, "error");
    welfareBack(PATH, "Incident recorded");
  }

  async function toggleResolved(formData: FormData) {
    "use server";
    const PATH = "/admin/welfare/incidents";

    const id = String(formData.get("id") ?? "").trim();
    const resolved = String(formData.get("resolved") ?? "").trim() === "true";
    if (!id) welfareBack(PATH, "Missing incident", "error");

    const supabase = getSupabaseServerClient();
    if (!supabase) welfareBack(PATH, "Database is not configured", "error");

    const { error } = await supabase.from("welfare_incidents").update({ resolved: !resolved }).eq("id", id);
    revalidatePath(PATH);
    if (error) welfareBack(PATH, error.message, "error");
    welfareBack(PATH, resolved ? "Incident reopened" : "Incident marked resolved");
  }

  async function deleteIncident(formData: FormData) {
    "use server";
    const PATH = "/admin/welfare/incidents";

    const id = String(formData.get("id") ?? "").trim();
    if (!id) welfareBack(PATH, "Missing incident", "error");

    const supabase = getSupabaseServerClient();
    if (!supabase) welfareBack(PATH, "Database is not configured", "error");

    const { error } = await supabase.from("welfare_incidents").delete().eq("id", id);
    revalidatePath(PATH);
    if (error) welfareBack(PATH, error.message, "error");
    welfareBack(PATH, "Incident deleted");
  }

  const openCount = incidentRows.filter((r) => !r.resolved).length;
  const seriousCount = incidentRows.filter((r) => r.severity >= 4).length;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Welfare"
        title="Incidents / Health"
        description="Record welfare incidents and health notes."
        actions={
          <a href="#new-incident" className={buttonClasses({ variant: "primary" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New incident
          </a>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Incidents" value={incidentRows.length} hint="Most recent 200" icon={HeartPulse} tone="slate" />
        <StatCard label="Open" value={openCount} hint="Not yet resolved" icon={CalendarDays} tone="gold" />
        <StatCard label="Serious (4–5)" value={seriousCount} hint="High-severity incidents" icon={AlertTriangle} tone="rose" />
      </div>

      <Card>
        <CardHeader title="Recent incidents" description="Newest first. Click a status to toggle it." />
        {incidentRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[760px]">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Type</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Date</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">
                    <span className="sr-only">Delete</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {incidentRows.map((i) => {
                  const s = studentById.get(i.student_id) ?? null;
                  return (
                    <tr key={i.id}>
                      <td className="font-semibold text-slate-900">{s ? `${s.first_name} ${s.last_name}` : i.student_id}</td>
                      <td className="max-w-xs">
                        <div className="font-medium text-slate-900">{i.incident_type}</div>
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-500" title={i.description}>
                          {i.description}
                        </p>
                      </td>
                      <td>
                        <SeverityBadge severity={i.severity} />
                      </td>
                      <td className="whitespace-nowrap">{shortDate(i.occurred_at)}</td>
                      <td>
                        <form action={toggleResolved}>
                          <input type="hidden" name="id" value={i.id} />
                          <input type="hidden" name="resolved" value={String(i.resolved)} />
                          <SubmitButton
                            className={pillButtonClasses(i.resolved ? "green" : "gold")}
                            pendingText="Saving…"
                            showSpinner={false}
                          >
                            <span
                              className="inline-flex items-center gap-1.5"
                              title={i.resolved ? "Click to reopen" : "Click to mark resolved"}
                            >
                              <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                              {i.resolved ? "Resolved" : "Open"}
                            </span>
                          </SubmitButton>
                        </form>
                      </td>
                      <td className="text-right">
                        <form action={deleteIncident}>
                          <input type="hidden" name="id" value={i.id} />
                          <ConfirmSubmitButton className={deleteLinkClasses} confirmMessage="Delete this incident? This cannot be undone.">
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
          <EmptyState icon={HeartPulse} title="No incidents yet" description="Incidents you record below will appear here." />
        )}
      </Card>

      <form action={createIncident} id="new-incident" className="scroll-mt-24">
        <FormSection
          title="New incident"
          description="Log a sickness, injury or other welfare incident."
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              Create incident
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Student" htmlFor="inc-student" required>
              <select id="inc-student" className="gf-select" name="student_id" defaultValue="" required>
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.first_name} {s.last_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Incident type" htmlFor="inc-type" required>
              <input
                id="inc-type"
                className="gf-input"
                name="incident_type"
                placeholder="Sickness, Injury, Misconduct..."
                required
              />
            </Field>
            <Field label="Academic year" htmlFor="inc-year" hint="Optional">
              <select id="inc-year" className="gf-select" name="academic_year_id" defaultValue="">
                <option value="">—</option>
                {yearRows.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic term" htmlFor="inc-term" hint="Optional">
              <select id="inc-term" className="gf-select" name="academic_term_id" defaultValue="">
                <option value="">—</option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" htmlFor="inc-description" required className="sm:col-span-2">
              <textarea id="inc-description" className="gf-input" name="description" rows={4} required />
            </Field>
            <Field label="Severity" htmlFor="inc-severity" hint="1 = minor, 5 = very serious" required>
              <input
                id="inc-severity"
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
