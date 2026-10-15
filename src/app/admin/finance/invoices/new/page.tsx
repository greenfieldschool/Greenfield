import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { toastUrl } from "../../_components/finance-server";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection, Field } from "@/components/ui/form-section";
import { ButtonLink } from "@/components/ui/button";

type GuardianRow = { id: string; full_name: string };

type StudentRow = { id: string; first_name: string; last_name: string };

type YearRow = { id: string; name: string };

type TermRow = { id: string; name: string; academic_year_id: string };

export default async function AdminNewInvoicePage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: guardians }, { data: students }, { data: years }, { data: terms }] = await Promise.all([
    supabase.from("guardians").select("id, full_name").order("full_name", { ascending: true }),
    supabase
      .from("students")
      .select("id, first_name, last_name")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true }),
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase
      .from("academic_terms")
      .select("id, name, academic_year_id")
      .order("starts_on", { ascending: false })
  ]);

  const guardianRows = (guardians ?? []) as GuardianRow[];
  const studentRows = (students ?? []) as StudentRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];

  async function createInvoice(formData: FormData) {
    "use server";

    const billToGuardianId = String(formData.get("bill_to_guardian_id") ?? "").trim();
    const studentIdRaw = String(formData.get("student_id") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();
    const issueDateRaw = String(formData.get("issue_date") ?? "").trim();
    const dueDateRaw = String(formData.get("due_date") ?? "").trim();
    const currency = String(formData.get("currency") ?? "NGN").trim() || "NGN";
    const notes = String(formData.get("notes") ?? "").trim();

    if (!billToGuardianId) redirect(toastUrl("/admin/finance/invoices/new", "Choose the guardian to bill", "error"));
    if (dueDateRaw && issueDateRaw && dueDateRaw < issueDateRaw) {
      redirect(toastUrl("/admin/finance/invoices/new", "Due date cannot be before the issue date", "error"));
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/invoices/new", "Database is not configured", "error"));

    const { data, error } = await supabase
      .from("finance_invoices")
      .insert({
        bill_to_guardian_id: billToGuardianId,
        student_id: studentIdRaw.length ? studentIdRaw : null,
        academic_year_id: yearIdRaw.length ? yearIdRaw : null,
        academic_term_id: termIdRaw.length ? termIdRaw : null,
        issue_date: issueDateRaw.length ? issueDateRaw : undefined,
        due_date: dueDateRaw.length ? dueDateRaw : null,
        currency,
        notes: notes.length ? notes : null,
        status: "draft"
      })
      .select("id")
      .maybeSingle();

    if (error || !data?.id) {
      redirect(toastUrl("/admin/finance/invoices/new", error?.message ?? "Could not create the invoice", "error"));
    }

    revalidatePath("/admin/finance/invoices");
    redirect(toastUrl(`/admin/finance/invoices/${data.id}`, "Invoice created"));
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/invoices", label: "Back to invoices" }}
        eyebrow="Finance"
        title="New invoice"
        description="Create an invoice. The invoice number is generated automatically."
      />

      <form action={createInvoice} className="space-y-6">
        <FormSection title="Bill to" description="Who the invoice is addressed to.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bill to guardian" htmlFor="bill_to_guardian_id" required className="sm:col-span-2">
              <select id="bill_to_guardian_id" className="gf-select" name="bill_to_guardian_id" required defaultValue="">
                <option value="" disabled>
                  Select guardian
                </option>
                {guardianRows.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.full_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Student (optional)" htmlFor="student_id">
              <select id="student_id" className="gf-select" name="student_id" defaultValue="">
                <option value="">—</option>
                {studentRows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.last_name} {s.first_name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Currency" htmlFor="currency">
              <input id="currency" className="gf-input" name="currency" defaultValue="NGN" />
            </Field>
          </div>
        </FormSection>

        <FormSection
          title="Period and dates"
          description="New invoices start as drafts. Add line items on the next screen."
          footer={
            <>
              <ButtonLink href="/admin/finance/invoices" variant="ghost">
                Cancel
              </ButtonLink>
              <SubmitButton variant="primary" pendingText="Creating…">
                Create invoice
              </SubmitButton>
            </>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Academic year (optional)" htmlFor="academic_year_id">
              <select id="academic_year_id" className="gf-select" name="academic_year_id" defaultValue="">
                <option value="">—</option>
                {yearRows.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Academic term (optional)" htmlFor="academic_term_id">
              <select id="academic_term_id" className="gf-select" name="academic_term_id" defaultValue="">
                <option value="">—</option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Issue date" htmlFor="issue_date" hint="Leave blank for today.">
              <input id="issue_date" className="gf-input" name="issue_date" type="date" />
            </Field>

            <Field label="Due date (optional)" htmlFor="due_date">
              <input id="due_date" className="gf-input" name="due_date" type="date" />
            </Field>

            <Field label="Notes (optional)" htmlFor="notes" className="sm:col-span-2">
              <textarea id="notes" className="gf-input min-h-28" name="notes" />
            </Field>
          </div>
        </FormSection>
      </form>
    </div>
  );
}
