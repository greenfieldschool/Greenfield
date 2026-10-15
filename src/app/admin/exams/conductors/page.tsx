import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Link2, UserPlus, UsersRound } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { failWithToast, NO_DB_MESSAGE } from "../_components/feedback";

type ProfileRow = { id: string; email: string | null; full_name: string | null };

type ConductorRow = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  active: boolean;
};

type ConductorLinkRow = { conductor_id: string; user_id: string };

export default async function AdminExamConductorsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: conductorsData }, { data: profilesData }, { data: linksData }] = await Promise.all([
    supabase.from("exam_conductors").select("id, full_name, email, phone, active").order("full_name"),
    supabase.from("profiles").select("id, email, full_name").order("updated_at", { ascending: false }).limit(200),
    supabase.from("exam_conductor_user_links").select("conductor_id, user_id")
  ]);

  const conductors = (conductorsData ?? []) as ConductorRow[];
  const profiles = (profilesData ?? []) as ProfileRow[];
  const links = (linksData ?? []) as ConductorLinkRow[];

  const userById = new Map(profiles.map((p) => [p.id, p] as const));
  const userIdByConductorId = new Map(links.map((l) => [l.conductor_id, l.user_id] as const));

  async function createConductor(formData: FormData) {
    "use server";

    const fullName = String(formData.get("full_name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!fullName) failWithToast("/admin/exams/conductors", "Enter the conductor's full name.");

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast("/admin/exams/conductors", NO_DB_MESSAGE);

    await supabase.from("exam_conductors").insert({
      full_name: fullName,
      email: email.length ? email : null,
      phone: phone.length ? phone : null,
      active
    });

    revalidatePath("/admin/exams/conductors");
  }

  async function linkUser(formData: FormData) {
    "use server";

    const conductorId = String(formData.get("conductor_id") ?? "").trim();
    const userId = String(formData.get("user_id") ?? "").trim();

    if (!conductorId || !userId) failWithToast("/admin/exams/conductors", "Select a user account to link.");

    const supabase = getSupabaseServerClient();
    if (!supabase) failWithToast("/admin/exams/conductors", NO_DB_MESSAGE);

    await supabase
      .from("exam_conductor_user_links")
      .upsert({ conductor_id: conductorId, user_id: userId }, { onConflict: "user_id" });

    revalidatePath("/admin/exams/conductors");
  }

  const linkedCount = conductors.filter((c) => userIdByConductorId.has(c.id)).length;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/exams", label: "Back to exams" }}
        eyebrow="Exams"
        title="Conductors"
        description="Create conductors and link them to auth user accounts."
        actions={
          <a href="#new-conductor" className={buttonClasses({ variant: "primary" })}>
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            New conductor
          </a>
        }
      />

      <Card>
        <CardHeader
          title="All conductors"
          description={`${conductors.length} conductor${conductors.length === 1 ? "" : "s"} · ${linkedCount} linked to a sign-in`}
        />
        {conductors.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Conductor</th>
                  <th>Status</th>
                  <th>Linked user</th>
                  <th>Link to account</th>
                </tr>
              </thead>
              <tbody>
                {conductors.map((c) => {
                  const linkedUserId = userIdByConductorId.get(c.id) ?? "";
                  const linkedUser = linkedUserId.length ? userById.get(linkedUserId) ?? null : null;

                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="flex items-center gap-3">
                          <Avatar name={c.full_name} size="sm" />
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900">{c.full_name}</div>
                            <div className="text-xs text-slate-500">
                              {c.email ?? "—"} {c.phone ? ` • ${c.phone}` : ""}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge tone={c.active ? "green" : "slate"} dot>
                          {c.active ? "Active" : "Inactive"}
                        </Badge>
                      </td>
                      <td>
                        {linkedUser?.email ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-900">
                            <Link2 className="h-3.5 w-3.5 text-brand-green-600" aria-hidden="true" />
                            {linkedUser.email}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td>
                        <form action={linkUser} className="flex items-center gap-2">
                          <input type="hidden" name="conductor_id" value={c.id} />
                          <select
                            aria-label={`User account for ${c.full_name}`}
                            className="gf-select min-w-[14rem] py-2"
                            name="user_id"
                            defaultValue={linkedUserId}
                          >
                            <option value="">Select user</option>
                            {profiles.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.email ?? p.id}
                              </option>
                            ))}
                          </select>
                          <SubmitButton variant="secondary" size="sm" pendingText="Linking…">
                            Link
                          </SubmitButton>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={UsersRound} title="No conductors yet." description="Add the first conductor using the form below." />
        )}
      </Card>

      <form action={createConductor}>
        <FormSection
          id="new-conductor"
          title="New conductor"
          description="Conductors supervise exam sessions and can unlock students who get locked out."
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              Create conductor
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="conductor-name" required className="sm:col-span-2">
              <input id="conductor-name" className="gf-input" name="full_name" required />
            </Field>
            <Field label="Email" htmlFor="conductor-email">
              <input id="conductor-email" className="gf-input" name="email" type="email" />
            </Field>
            <Field label="Phone" htmlFor="conductor-phone">
              <input id="conductor-phone" className="gf-input" name="phone" type="tel" />
            </Field>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input className="gf-checkbox" name="active" type="checkbox" defaultChecked />
              Active
            </label>
          </div>
        </FormSection>
      </form>
    </div>
  );
}
