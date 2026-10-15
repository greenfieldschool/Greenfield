import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import SubmitButton from "@/components/submit-button";
import { redirect } from "next/navigation";
import { toastUrl } from "../../_components/finance-server";
import UrlToast from "@/components/url-toast";
import { Layers, Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { EmptyState } from "@/components/ui/empty-state";

type RevenueCategoryRow = {
  id: string;
  name: string;
};

type ExpenseCategoryRow = {
  id: string;
  name: string;
};

type FeeComponentRow = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  revenue_categories: RevenueCategoryRow | RevenueCategoryRow[] | null;
  expense_categories: ExpenseCategoryRow | ExpenseCategoryRow[] | null;
};

export default async function AdminFeeComponentsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: revenueCats }, { data: expenseCats }, { data: components }] = await Promise.all([
    supabase.from("revenue_categories").select("id, name").order("name"),
    supabase.from("expense_categories").select("id, name").order("name"),
    supabase
      .from("fee_components")
      .select(
        "id, name, description, active, revenue_categories(id, name), expense_categories(id, name)"
      )
      .order("name")
  ]);

  const revenueCategories = (revenueCats ?? []) as RevenueCategoryRow[];
  const expenseCategories = (expenseCats ?? []) as ExpenseCategoryRow[];
  const feeComponents = (components ?? []) as unknown as FeeComponentRow[];

  async function createComponent(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const revenueCategoryId = String(formData.get("revenue_category_id") ?? "").trim();
    const expenseCategoryId = String(formData.get("expense_category_id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!name) redirect(toastUrl("/admin/finance/fees/components", "Enter a name", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/fees/components", "Database is not configured", "error"));

    const { error } = await supabase.from("fee_components").insert({
      name,
      description: description.length ? description : null,
      revenue_category_id: revenueCategoryId.length ? revenueCategoryId : null,
      expense_category_id: expenseCategoryId.length ? expenseCategoryId : null,
      active
    });

    if (error) redirect(toastUrl("/admin/finance/fees/components", error.message, "error"));
    revalidatePath("/admin/finance/fees/components");
    redirect(toastUrl("/admin/finance/fees/components", "Fee component created"));
  }

  async function toggleActive(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "true";

    if (!id) redirect(toastUrl("/admin/finance/fees/components", "Missing fee component", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/fees/components", "Database is not configured", "error"));

    const { error } = await supabase.from("fee_components").update({ active: !active }).eq("id", id);
    if (error) redirect(toastUrl("/admin/finance/fees/components", error.message, "error"));
    revalidatePath("/admin/finance/fees/components");
    redirect(toastUrl("/admin/finance/fees/components", active ? "Component deactivated" : "Component activated"));
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/fees", label: "Back to fee setup" }}
        eyebrow="Finance"
        title="Fee components"
        description="Define the breakdown items for school fees (Tuition, Books, Transport…) and map them to revenue categories. Optional: also map to an expense/budget category (sector)."
      />

      <form action={createComponent}>
        <FormSection
          title="Add fee component"
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create component
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required>
              <input id="name" className="gf-input" name="name" placeholder="Tuition" required />
            </Field>
            <Field label="Revenue category" htmlFor="revenue_category_id">
              <select id="revenue_category_id" className="gf-select" name="revenue_category_id" defaultValue="">
                <option value="">(optional)</option>
                {revenueCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Budget sector (expense category)" htmlFor="expense_category_id">
              <select id="expense_category_id" className="gf-select" name="expense_category_id" defaultValue="">
                <option value="">(optional)</option>
                {expenseCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" htmlFor="description">
              <input id="description" className="gf-input" name="description" placeholder="(optional)" />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
              <input className="gf-checkbox" name="active" type="checkbox" defaultChecked />
              Active
            </label>
          </div>
        </FormSection>
      </form>

      <Card>
        <CardHeader title="All components" description={`${feeComponents.length} total`} />
        {feeComponents.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[640px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Revenue category</th>
                  <th>Budget sector</th>
                  <th>Status</th>
                  <th className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {feeComponents.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold text-slate-900">{c.name}</td>
                    <td>{firstOrNull(c.revenue_categories)?.name ?? "—"}</td>
                    <td>{firstOrNull(c.expense_categories)?.name ?? "—"}</td>
                    <td>
                      <Badge tone={c.active ? "green" : "slate"} dot>
                        {c.active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="text-right">
                      <form action={toggleActive} className="inline">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={String(c.active)} />
                        <SubmitButton variant="ghost" size="sm" pendingText="Saving…" showSpinner={false}>
                          {c.active ? "Deactivate" : "Activate"}
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Layers} title="No components yet" description="Use the form above to add Tuition, Books, Transport…" />
        )}
      </Card>
    </div>
  );
}
