import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { redirect } from "next/navigation";
import { ChevronRight, UserPlus, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { EmptyState } from "@/components/ui/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { buttonClasses } from "@/components/ui/button";

type GuardianRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

export default async function AdminGuardiansPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const { data } = await supabase
    .from("guardians")
    .select("id, full_name, email, phone")
    .order("full_name", { ascending: true });

  const guardians = (data ?? []) as GuardianRow[];

  async function createGuardian(formData: FormData) {
    "use server";

    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();

    if (!fullName) redirect(guardiansToast("Full name is required"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(guardiansToast("Server error — Supabase is not configured"));

    const { error } = await supabase.from("guardians").insert({
      full_name: fullName,
      email: email.length ? email : null,
      phone: phone.length ? phone : null
    });
    if (error) redirect(guardiansToast(error.message));

    revalidatePath("/admin/guardians");
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Admin"
        title="Guardians"
        description="Manage parents/guardians and link them to students."
        actions={
          <a href="#add-guardian" className={buttonClasses({ variant: "primary" })}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            Add guardian
          </a>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="All guardians"
            description={`${guardians.length} guardian${guardians.length === 1 ? "" : "s"}`}
          />
          {guardians.length ? (
            <div className="gf-table-wrap">
              <table className="gf-table min-w-[560px]">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th className="w-10">
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {guardians.map((g) => (
                    <tr key={g.id} className="group">
                      <td>
                        <Link href={`/admin/guardians/${g.id}`} className="flex items-center gap-3 font-semibold text-slate-900 hover:text-brand-green">
                          <Avatar name={g.full_name} size="sm" />
                          {g.full_name}
                        </Link>
                      </td>
                      <td>{g.email ?? "—"}</td>
                      <td className="whitespace-nowrap">{g.phone ?? "—"}</td>
                      <td className="text-right">
                        <Link
                          href={`/admin/guardians/${g.id}`}
                          aria-label={`Open ${g.full_name}`}
                          className="inline-flex text-slate-300 transition group-hover:text-brand-green"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={Users}
              title="No guardians yet."
              description="Add a parent or guardian using the form, then link them to their children."
            />
          )}
        </Card>

        <form action={createGuardian} id="add-guardian" className="scroll-mt-24">
          <FormSection
            title="Add guardian"
            description="Email and phone are optional."
            footer={
              <SubmitButton variant="primary" pendingText="Creating…">
                Create guardian
              </SubmitButton>
            }
          >
            <div className="grid gap-4">
              <Field label="Full name" htmlFor="guardian-full-name" required>
                <input id="guardian-full-name" className="gf-input" name="full_name" required />
              </Field>
              <Field label="Email" htmlFor="guardian-email">
                <input id="guardian-email" className="gf-input" name="email" type="email" />
              </Field>
              <Field label="Phone" htmlFor="guardian-phone">
                <input id="guardian-phone" className="gf-input" name="phone" type="tel" />
              </Field>
            </div>
          </FormSection>
        </form>
      </div>
    </div>
  );
}

function guardiansToast(message: string, type: "error" | "success" = "error") {
  return `/admin/guardians?toast=${encodeURIComponent(message)}&toast_type=${type}`;
}
