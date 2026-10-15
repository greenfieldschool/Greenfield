import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import { redirect } from "next/navigation";
import { toastUrl } from "../../_components/finance-server";
import UrlToast from "@/components/url-toast";
import { Plus, Tags } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { EmptyState } from "@/components/ui/empty-state";

type RevenueCategoryRow = {
  id: string;
  name: string;
  description: string | null;
};

export default async function AdminRevenueCategoriesPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase.from("revenue_categories").select("id, name, description").order("name");
  const categories = (data ?? []) as RevenueCategoryRow[];

  async function createCategory(formData: FormData) {
    "use server";

    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();

    if (!name) redirect(toastUrl("/admin/finance/fees/revenue-categories", "Enter a name", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/fees/revenue-categories", "Database is not configured", "error"));

    const { error } = await supabase.from("revenue_categories").insert({
      name,
      description: description.length ? description : null
    });

    if (error) redirect(toastUrl("/admin/finance/fees/revenue-categories", error.message, "error"));

    revalidatePath("/admin/finance/fees/revenue-categories");
    redirect(toastUrl("/admin/finance/fees/revenue-categories", "Category created"));
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/fees", label: "Back to fee setup" }}
        eyebrow="Finance"
        title="Revenue categories"
        description="Define revenue buckets (e.g. School fees, Registration, Transport) used for reporting and fee component mapping."
      />

      <form action={createCategory}>
        <FormSection
          title="Add category"
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create category
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name" required>
              <input id="name" className="gf-input" name="name" placeholder="School fees" required />
            </Field>
            <Field label="Description" htmlFor="description">
              <input id="description" className="gf-input" name="description" placeholder="(optional)" />
            </Field>
          </div>
        </FormSection>
      </form>

      <Card>
        <CardHeader title="All categories" description={`${categories.length} total`} />
        {categories.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table">
              <thead>
                <tr>
                  <th className="w-1/3">Name</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold text-slate-900">{c.name}</td>
                    <td>{c.description ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Tags} title="No revenue categories yet" description="Use the form above to add the first one." />
        )}
      </Card>
    </div>
  );
}
