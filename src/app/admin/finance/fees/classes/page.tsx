import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import { redirect } from "next/navigation";
import { toastUrl } from "../../_components/finance-server";
import UrlToast from "@/components/url-toast";
import { Plus, School } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";

type ClassRow = {
  id: string;
  level: string;
  name: string;
  active: boolean;
};

export default async function AdminFeeClassesPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data } = await supabase.from("classes").select("id, level, name, active").order("level").order("name");
  const classes = (data ?? []) as ClassRow[];

  async function createClass(formData: FormData) {
    "use server";

    const level = String(formData.get("level") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!level || !name) redirect(toastUrl("/admin/finance/fees/classes", "Choose a level and enter a class name", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/fees/classes", "Database is not configured", "error"));

    const { error } = await supabase.from("classes").insert({ level, name, active });
    if (error) redirect(toastUrl("/admin/finance/fees/classes", error.message, "error"));
    revalidatePath("/admin/finance/fees/classes");
    redirect(toastUrl("/admin/finance/fees/classes", "Class created"));
  }

  async function toggleActive(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "true";

    if (!id) redirect(toastUrl("/admin/finance/fees/classes", "Missing class", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl("/admin/finance/fees/classes", "Database is not configured", "error"));

    const { error } = await supabase.from("classes").update({ active: !active }).eq("id", id);
    if (error) redirect(toastUrl("/admin/finance/fees/classes", error.message, "error"));
    revalidatePath("/admin/finance/fees/classes");
    redirect(toastUrl("/admin/finance/fees/classes", active ? "Class deactivated" : "Class activated"));
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/fees", label: "Back to fee setup" }}
        eyebrow="Finance"
        title="Classes"
        description="Create class names like Year 1…5, JSS1…SS3, Creche, Nursery."
      />

      <form action={createClass}>
        <FormSection
          title="Add class"
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create class
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Level" htmlFor="level" required>
              <select id="level" className="gf-select" name="level" required defaultValue="primary">
                <option value="creche">Creche</option>
                <option value="primary">Primary</option>
                <option value="secondary">Secondary</option>
              </select>
            </Field>
            <Field label="Class name" htmlFor="name" required className="sm:col-span-2">
              <input id="name" className="gf-input" name="name" placeholder="Year 1" required />
            </Field>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-3">
              <input className="gf-checkbox" name="active" type="checkbox" defaultChecked />
              Active
            </label>
          </div>
        </FormSection>
      </form>

      <Card>
        <CardHeader title="All classes" description="Click Activate / Deactivate to change a class's status." />
        {classes.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[480px]">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id}>
                    <td className="capitalize">{c.level}</td>
                    <td className="font-semibold text-slate-900">{c.name}</td>
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
          <EmptyState icon={School} title="No classes yet" description="Use the form above to add the first class." />
        )}
      </Card>
    </div>
  );
}
