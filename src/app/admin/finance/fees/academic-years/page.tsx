import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { toastUrl } from "../../_components/finance-server";
import { CalendarRange, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { fmtDate } from "../../_components/finance-ui";

type AcademicYearRow = {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
};

type AcademicTermRow = {
  id: string;
  academic_year_id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean;
  academic_years?: { id: string; name: string } | Array<{ id: string; name: string }> | null;
};

export default async function AdminAcademicYearsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: yearsData }, { data: termsData }] = await Promise.all([
    supabase
      .from("academic_years")
      .select("id, name, starts_on, ends_on, is_active")
      .order("starts_on", { ascending: false })
      .order("name", { ascending: false }),
    supabase
      .from("academic_terms")
      .select("id, academic_year_id, name, starts_on, ends_on, is_active, academic_years(id, name)")
      .order("starts_on", { ascending: false })
      .order("name", { ascending: true })
      .limit(500)
  ]);

  const years = (yearsData ?? []) as AcademicYearRow[];
  const terms = (termsData ?? []) as unknown as AcademicTermRow[];

  async function createYear(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const startsOn = String(formData.get("starts_on") ?? "").trim();
    const endsOn = String(formData.get("ends_on") ?? "").trim();
    const isActive = String(formData.get("is_active") ?? "").trim() === "on";

    if (!name) redirect(toastUrl("/admin/finance/fees/academic-years", "Choose an academic year", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/fees/academic-years", "Database is not configured", "error"));

    if (isActive) {
      await supabase.from("academic_years").update({ is_active: false }).eq("is_active", true);
    }

    const { error } = await supabase.from("academic_years").insert({
      name,
      starts_on: startsOn.length ? startsOn : null,
      ends_on: endsOn.length ? endsOn : null,
      is_active: isActive
    });

    if (error) redirect(toastUrl("/admin/finance/fees/academic-years", error.message, "error"));

    revalidatePath("/admin/finance/fees/academic-years");
    redirect(`/admin/finance/fees/academic-years?toast=${encodeURIComponent("Academic year created")}&toast_type=success`);
  }

  async function toggleYearActive(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "true";

    if (!id) redirect(toastUrl("/admin/finance/fees/academic-years", "Missing academic year", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/fees/academic-years", "Database is not configured", "error"));

    if (!active) {
      await supabase.from("academic_years").update({ is_active: false }).eq("is_active", true);
      const { error } = await supabase.from("academic_years").update({ is_active: true }).eq("id", id);
      if (error) redirect(toastUrl("/admin/finance/fees/academic-years", error.message, "error"));
    } else {
      const { error } = await supabase.from("academic_years").update({ is_active: false }).eq("id", id);
      if (error) redirect(toastUrl("/admin/finance/fees/academic-years", error.message, "error"));
    }

    revalidatePath("/admin/finance/fees/academic-years");
    redirect(`/admin/finance/fees/academic-years?toast=${encodeURIComponent(active ? "Year deactivated" : "Year set as active")}&toast_type=success`);
  }

  async function createTerm(formData: FormData) {
    "use server";

    const academicYearId = String(formData.get("academic_year_id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const startsOn = String(formData.get("starts_on") ?? "").trim();
    const endsOn = String(formData.get("ends_on") ?? "").trim();
    const isActive = String(formData.get("is_active") ?? "").trim() === "on";

    if (!academicYearId || !name) redirect(toastUrl("/admin/finance/fees/academic-years", "Choose an academic year and term", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/fees/academic-years", "Database is not configured", "error"));

    if (isActive) {
      await supabase
        .from("academic_terms")
        .update({ is_active: false })
        .eq("academic_year_id", academicYearId)
        .eq("is_active", true);
    }

    const { error } = await supabase.from("academic_terms").insert({
      academic_year_id: academicYearId,
      name,
      starts_on: startsOn.length ? startsOn : null,
      ends_on: endsOn.length ? endsOn : null,
      is_active: isActive
    });

    if (error) redirect(toastUrl("/admin/finance/fees/academic-years", error.message, "error"));

    revalidatePath("/admin/finance/fees/academic-years");
    redirect(`/admin/finance/fees/academic-years?toast=${encodeURIComponent("Term created")}&toast_type=success`);
  }

  async function toggleTermActive(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const academicYearId = String(formData.get("academic_year_id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "true";

    if (!id || !academicYearId) redirect(toastUrl("/admin/finance/fees/academic-years", "Missing academic term", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/fees/academic-years", "Database is not configured", "error"));

    if (!active) {
      await supabase
        .from("academic_terms")
        .update({ is_active: false })
        .eq("academic_year_id", academicYearId)
        .eq("is_active", true);
      const { error } = await supabase.from("academic_terms").update({ is_active: true }).eq("id", id);
      if (error) redirect(toastUrl("/admin/finance/fees/academic-years", error.message, "error"));
    } else {
      const { error } = await supabase.from("academic_terms").update({ is_active: false }).eq("id", id);
      if (error) redirect(toastUrl("/admin/finance/fees/academic-years", error.message, "error"));
    }

    revalidatePath("/admin/finance/fees/academic-years");
    redirect(`/admin/finance/fees/academic-years?toast=${encodeURIComponent(active ? "Term deactivated" : "Term set as active")}&toast_type=success`);
  }

  const activeYearId = years.find((y) => y.is_active)?.id ?? "";

  // Generate academic year options: 4 years back to 3 years forward
  const currentYear = new Date().getFullYear();
  const yearOptions: string[] = [];
  for (let y = currentYear - 4; y <= currentYear + 3; y++) {
    yearOptions.push(`${y}/${y + 1}`);
  }
  // Put the most likely upcoming year first
  yearOptions.reverse();
  const existingYearNames = new Set(years.map((y) => y.name));
  const availableYearOptions = yearOptions.filter((n) => !existingYearNames.has(n));
  const suggestedYear = yearOptions.find((n) => !existingYearNames.has(n)) ?? yearOptions[0];

  const termOptions = ["First Term", "Second Term", "Third Term"] as const;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/fees", label: "Back to fee setup" }}
        eyebrow="Finance"
        title="Academic years & terms"
        description="Define academic calendars used across exams, attendance, invoices, and fees."
      />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <form action={createYear}>
          <FormSection
            title="Add academic year"
            footer={
              <SubmitButton variant="primary" pendingText="Creating…">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create academic year
              </SubmitButton>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Academic year" htmlFor="year-name" required className="sm:col-span-2">
                <select id="year-name" className="gf-select" name="name" defaultValue={suggestedYear} required>
                  {availableYearOptions.length
                    ? availableYearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))
                    : yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                </select>
                {availableYearOptions.length === 0 ? (
                  <p className="mt-1.5 text-xs text-brand-gold-800">All nearby year pairs already exist. You can still re-add one.</p>
                ) : null}
              </Field>
              <Field label="Starts on" htmlFor="year-starts">
                <input id="year-starts" className="gf-input" name="starts_on" type="date" />
              </Field>
              <Field label="Ends on" htmlFor="year-ends">
                <input id="year-ends" className="gf-input" name="ends_on" type="date" />
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
                <input className="gf-checkbox" name="is_active" type="checkbox" />
                Set as active
              </label>
            </div>
          </FormSection>
        </form>

        <form action={createTerm}>
          <FormSection
            title="Add academic term"
            footer={
              <SubmitButton variant="primary" pendingText="Creating…">
                <Plus className="h-4 w-4" aria-hidden="true" />
                Create academic term
              </SubmitButton>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Academic year" htmlFor="term-year" required>
                <select id="term-year" className="gf-select" name="academic_year_id" defaultValue={activeYearId} required>
                  <option value="" disabled>
                    Select year
                  </option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Term" htmlFor="term-name" required>
                <select id="term-name" className="gf-select" name="name" defaultValue="First Term" required>
                  {termOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Starts on" htmlFor="term-starts">
                <input id="term-starts" className="gf-input" name="starts_on" type="date" />
              </Field>
              <Field label="Ends on" htmlFor="term-ends">
                <input id="term-ends" className="gf-input" name="ends_on" type="date" />
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
                <input className="gf-checkbox" name="is_active" type="checkbox" />
                Set as active for selected year
              </label>
            </div>
          </FormSection>
        </form>
      </div>

      <Card>
        <CardHeader title="Academic years" description="Only one year can be active at a time." />
        {years.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[560px]">
              <thead>
                <tr>
                  <th>Academic year</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Status</th>
                  <th className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {years.map((y) => (
                  <tr key={y.id}>
                    <td className="font-semibold text-slate-900">{y.name}</td>
                    <td className="whitespace-nowrap">{y.starts_on ? fmtDate(y.starts_on) : "—"}</td>
                    <td className="whitespace-nowrap">{y.ends_on ? fmtDate(y.ends_on) : "—"}</td>
                    <td>
                      {y.is_active ? (
                        <Badge tone="green" dot>
                          Active
                        </Badge>
                      ) : (
                        <Badge tone="slate">Inactive</Badge>
                      )}
                    </td>
                    <td className="text-right">
                      <form action={toggleYearActive} className="inline">
                        <input type="hidden" name="id" value={y.id} />
                        <input type="hidden" name="active" value={String(y.is_active)} />
                        <SubmitButton variant={y.is_active ? "ghost" : "secondary"} size="sm" pendingText="Saving…" showSpinner={false}>
                          {y.is_active ? "Deactivate" : "Set active"}
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={CalendarRange} title="No academic years yet" description="Add the current academic year above." />
        )}
      </Card>

      <Card>
        <CardHeader title="Academic terms" description="One active term per academic year." />
        {terms.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Term</th>
                  <th>Starts</th>
                  <th>Ends</th>
                  <th>Status</th>
                  <th className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {terms.map((t) => (
                  <tr key={t.id}>
                    <td className="font-semibold text-slate-900">{firstOrNull(t.academic_years)?.name ?? "—"}</td>
                    <td>{t.name}</td>
                    <td className="whitespace-nowrap">{t.starts_on ? fmtDate(t.starts_on) : "—"}</td>
                    <td className="whitespace-nowrap">{t.ends_on ? fmtDate(t.ends_on) : "—"}</td>
                    <td>
                      {t.is_active ? (
                        <Badge tone="green" dot>
                          Active
                        </Badge>
                      ) : (
                        <Badge tone="slate">Inactive</Badge>
                      )}
                    </td>
                    <td className="text-right">
                      <form action={toggleTermActive} className="inline">
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="academic_year_id" value={t.academic_year_id} />
                        <input type="hidden" name="active" value={String(t.is_active)} />
                        <SubmitButton variant={t.is_active ? "ghost" : "secondary"} size="sm" pendingText="Saving…" showSpinner={false}>
                          {t.is_active ? "Deactivate" : "Set active"}
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={CalendarRange} title="No academic terms yet" description="Add terms for each academic year above." />
        )}
      </Card>
    </div>
  );
}
