import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { lagosLocalToDate, toastUrl } from "../../_components/finance-server";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection, Field } from "@/components/ui/form-section";

type CategoryRow = { id: string; name: string };

type YearRow = { id: string; name: string };

type TermRow = { id: string; name: string };

export default async function AdminNewExpensePage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: categories }, { data: years }, { data: terms }] = await Promise.all([
    supabase.from("expense_categories").select("id, name").order("name", { ascending: true }),
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false })
  ]);

  const categoryRows = (categories ?? []) as CategoryRow[];
  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];

  async function createExpense(formData: FormData) {
    "use server";

    const categoryIdRaw = String(formData.get("category_id") ?? "").trim();
    const vendorName = String(formData.get("vendor_name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").trim() || "0");
    const currency = String(formData.get("currency") ?? "NGN").trim() || "NGN";
    const method = String(formData.get("method") ?? "").trim();
    const reference = String(formData.get("reference") ?? "").trim();
    const spentAtRaw = String(formData.get("spent_at") ?? "").trim();
    const yearIdRaw = String(formData.get("academic_year_id") ?? "").trim();
    const termIdRaw = String(formData.get("academic_term_id") ?? "").trim();

    if (!Number.isFinite(amount) || amount <= 0) redirect(toastUrl("/admin/finance/expenses/new", "Enter an amount greater than zero", "error"));
    const spentAt = spentAtRaw.length ? lagosLocalToDate(spentAtRaw) : null;
    if (spentAtRaw.length && !spentAt) redirect(toastUrl("/admin/finance/expenses/new", "Enter a valid date and time", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/expenses/new", "Database is not configured", "error"));

    const { error } = await supabase.from("finance_expenses").insert({
      category_id: categoryIdRaw.length ? categoryIdRaw : null,
      vendor_name: vendorName.length ? vendorName : null,
      description: description.length ? description : null,
      amount,
      currency,
      method: method.length ? method : null,
      reference: reference.length ? reference : null,
      spent_at: spentAt ? spentAt.toISOString() : undefined,
      academic_year_id: yearIdRaw.length ? yearIdRaw : null,
      academic_term_id: termIdRaw.length ? termIdRaw : null
    });

    if (error) redirect(toastUrl("/admin/finance/expenses/new", error.message, "error"));

    revalidatePath("/admin/finance/expenses");
    redirect(toastUrl("/admin/finance/expenses", "Expense recorded"));
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/expenses", label: "Back to expenses" }}
        eyebrow="Finance"
        title="New expense"
        description="Record a school expense."
      />

      <form action={createExpense}>
        <FormSection
          title="Expense details"
          description="Only the amount is required. Everything else helps with reporting."
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              Create expense
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category (optional)" htmlFor="category_id">
              <select id="category_id" className="gf-select" name="category_id" defaultValue="">
                <option value="">—</option>
                {categoryRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Vendor (optional)" htmlFor="vendor_name">
              <input id="vendor_name" className="gf-input" name="vendor_name" />
            </Field>

            <Field label="Description (optional)" htmlFor="description" className="sm:col-span-2">
              <input id="description" className="gf-input" name="description" />
            </Field>

            <Field label="Amount" htmlFor="amount" required>
              <input
                id="amount"
                className="gf-input text-right tabular-nums"
                name="amount"
                inputMode="decimal"
                defaultValue="0"
                required
              />
            </Field>

            <Field label="Currency" htmlFor="currency">
              <input id="currency" className="gf-input" name="currency" defaultValue="NGN" />
            </Field>

            <Field label="Method (optional)" htmlFor="method">
              <input id="method" className="gf-input" name="method" />
            </Field>

            <Field label="Reference (optional)" htmlFor="reference">
              <input id="reference" className="gf-input" name="reference" />
            </Field>

            <Field label="Spent at (optional)" hint="Lagos time." htmlFor="spent_at" className="sm:col-span-2">
              <input id="spent_at" className="gf-input sm:max-w-xs" name="spent_at" type="datetime-local" />
            </Field>

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
          </div>
        </FormSection>
      </form>
    </div>
  );
}
