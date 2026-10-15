import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import SubmitButton from "@/components/submit-button";
import { redirect } from "next/navigation";
import { toastUrl } from "../../_components/finance-server";
import UrlToast from "@/components/url-toast";
import { ChevronRight, Plus, TableProperties } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { EmptyState } from "@/components/ui/empty-state";

type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string; academic_year_id: string };
type ClassRow = { id: string; level: string; name: string; active: boolean };

type ScheduleRow = {
  id: string;
  name: string;
  currency: string;
  active: boolean;
  academic_years: YearRow | YearRow[] | null;
  academic_terms: TermRow | TermRow[] | null;
  classes: ClassRow | ClassRow[] | null;
};

export default async function AdminFeeSchedulesPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: years }, { data: terms }, { data: classes }, { data: schedules }] = await Promise.all([
    supabase.from("academic_years").select("id, name").order("starts_on", { ascending: false }),
    supabase.from("academic_terms").select("id, name, academic_year_id").order("starts_on", { ascending: false }),
    supabase.from("classes").select("id, level, name, active").eq("active", true).order("level").order("name"),
    supabase
      .from("fee_schedules")
      .select(
        "id, name, currency, active, academic_years(id, name), academic_terms(id, name, academic_year_id), classes(id, level, name, active)"
      )
      .order("created_at", { ascending: false })
      .limit(200)
  ]);

  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const classRows = (classes ?? []) as ClassRow[];
  const scheduleRows = (schedules ?? []) as unknown as ScheduleRow[];

  async function createSchedule(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const academicYearId = String(formData.get("academic_year_id") ?? "").trim();
    const academicTermIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();
    const currency = String(formData.get("currency") ?? "NGN").trim() || "NGN";
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!name || !academicYearId || !classId) {
      redirect(toastUrl("/admin/finance/fees/schedules", "Enter a name and choose an academic year and class", "error"));
    }

    const academicTermId = academicTermIdRaw.length ? academicTermIdRaw : null;

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/fees/schedules", "Database is not configured", "error"));

    const { error } = await supabase.from("fee_schedules").insert({
      name,
      academic_year_id: academicYearId,
      academic_term_id: academicTermId,
      class_id: classId,
      currency,
      active
    });

    if (error) redirect(toastUrl("/admin/finance/fees/schedules", error.message, "error"));
    revalidatePath("/admin/finance/fees/schedules");
    redirect(toastUrl("/admin/finance/fees/schedules", "Fee schedule created"));
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/fees", label: "Back to fee setup" }}
        eyebrow="Finance"
        title="Fee schedules"
        description="Create schedules for a specific class, either per-term (choose a term) or annual (leave term blank)."
      />

      <form action={createSchedule}>
        <FormSection
          title="Create schedule"
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create schedule
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required className="sm:col-span-2">
              <input id="name" className="gf-input" name="name" placeholder="2026 Term 1 - Year 1 Fees" required />
            </Field>
            <Field label="Academic year" htmlFor="academic_year_id" required>
              <select id="academic_year_id" className="gf-select" name="academic_year_id" required defaultValue="">
                <option value="" disabled>
                  Select year
                </option>
                {yearRows.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic term (optional)" htmlFor="academic_term_id" hint="Leave as annual for a whole-year schedule.">
              <select id="academic_term_id" className="gf-select" name="academic_term_id" defaultValue="">
                <option value="">(annual)</option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Class" htmlFor="class_id" required>
              <select id="class_id" className="gf-select" name="class_id" required defaultValue="">
                <option value="" disabled>
                  Select class
                </option>
                {classRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Currency" htmlFor="currency">
              <input id="currency" className="gf-input" name="currency" defaultValue="NGN" />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
              <input className="gf-checkbox" name="active" type="checkbox" defaultChecked />
              Active
            </label>
          </div>
        </FormSection>
      </form>

      <Card>
        <CardHeader title="Schedules" description="Most recent 200. Open a schedule to set its fee lines." />
        {scheduleRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Schedule</th>
                  <th>Class</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="text-right">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <Link className="gf-link" href={`/admin/finance/fees/schedules/${s.id}`}>
                        {s.name}
                      </Link>
                      <div className="mt-0.5 text-xs text-slate-500">{firstOrNull(s.academic_years)?.name}</div>
                    </td>
                    <td className="whitespace-nowrap">
                      <span className="capitalize">{firstOrNull(s.classes)?.level}</span> - {firstOrNull(s.classes)?.name}
                    </td>
                    <td>
                      <Badge tone={firstOrNull(s.academic_terms) ? "blue" : "violet"}>{firstOrNull(s.academic_terms) ? "Term" : "Annual"}</Badge>
                    </td>
                    <td>
                      <Badge tone={s.active ? "green" : "slate"} dot>
                        {s.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <Link
                        className={buttonClasses({ variant: "ghost", size: "sm" })}
                        href={`/admin/finance/fees/schedules/${s.id}`}
                      >
                        Open
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={TableProperties} title="No schedules yet" description="Create one above for a class and term." />
        )}
      </Card>
    </div>
  );
}
