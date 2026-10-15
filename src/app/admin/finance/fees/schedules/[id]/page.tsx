import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { firstOrNull } from "@/lib/relations";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { ListPlus, Save, SearchX, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { fmtMoney } from "../../../_components/finance-ui";
import { toastUrl } from "../../../_components/finance-server";

type ScheduleRow = {
  id: string;
  name: string;
  currency: string;
};

type ComponentRow = {
  id: string;
  name: string;
  active: boolean;
};

type LineRow = {
  id: string;
  amount: number;
  fee_components: { id: string; name: string } | Array<{ id: string; name: string }> | null;
};

export default async function AdminFeeScheduleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: schedule }, { data: components }, { data: lines }] = await Promise.all([
    supabase.from("fee_schedules").select("id, name, currency").eq("id", id).maybeSingle(),
    supabase.from("fee_components").select("id, name, active").eq("active", true).order("name"),
    supabase
      .from("fee_schedule_lines")
      .select("id, amount, fee_components(id, name)")
      .eq("fee_schedule_id", id)
      .order("created_at", { ascending: false })
  ]);

  const scheduleRow = schedule as ScheduleRow | null;
  if (!scheduleRow) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: "/admin/finance/fees/schedules", label: "Back" }} eyebrow="Fee schedule" title="Schedule not found" />
        <Card>
          <EmptyState
            icon={SearchX}
            title="Schedule not found"
            description="It may have been removed. Go back to the list of schedules."
            action={
              <ButtonLink href="/admin/finance/fees/schedules" variant="secondary" size="sm">
                Back to schedules
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  const componentRows = (components ?? []) as ComponentRow[];
  const lineRows = (lines ?? []) as unknown as LineRow[];

  const total = lineRows.reduce((sum, l) => sum + Number(l.amount ?? 0), 0);

  async function addLine(formData: FormData) {
    "use server";

    const back = `/admin/finance/fees/schedules/${id}`;
    const feeComponentId = String(formData.get("fee_component_id") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").replace(/,/g, "").trim() || "0");

    if (!feeComponentId) redirect(toastUrl(back, "Choose a fee component", "error"));
    if (!Number.isFinite(amount) || amount <= 0) redirect(toastUrl(back, "Enter an amount greater than zero", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(back, "Database is not configured", "error"));

    // fee_schedule_lines has unique (fee_schedule_id, fee_component_id): saving an existing component updates it.
    const { error } = await supabase.from("fee_schedule_lines").upsert(
      {
        fee_schedule_id: id,
        fee_component_id: feeComponentId,
        amount
      },
      { onConflict: "fee_schedule_id,fee_component_id" }
    );

    if (error) redirect(toastUrl(back, error.message, "error"));

    revalidatePath(back);
    redirect(toastUrl(back, "Line saved"));
  }

  async function removeLine(formData: FormData) {
    "use server";

    const back = `/admin/finance/fees/schedules/${id}`;
    const lineId = String(formData.get("line_id") ?? "").trim();
    if (!lineId) redirect(toastUrl(back, "Missing line", "error"));

    const supabase = getSupabaseServerClient();
    if (!supabase) redirect(toastUrl(back, "Database is not configured", "error"));

    const { error } = await supabase.from("fee_schedule_lines").delete().eq("id", lineId);
    if (error) redirect(toastUrl(back, error.message, "error"));

    revalidatePath(back);
    redirect(toastUrl(back, "Line removed"));
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/fees/schedules", label: "Back to schedules" }}
        eyebrow="Fee schedule"
        title={scheduleRow.name}
        actions={
          <div className="text-right">
            <div className="text-xs font-medium text-slate-500">Total</div>
            <div className="text-xl font-bold tabular-nums text-slate-900">{fmtMoney(total, scheduleRow.currency)}</div>
          </div>
        }
      />

      <form action={addLine}>
        <FormSection
          title="Add / update line"
          footer={
            <SubmitButton variant="primary" pendingText="Saving…">
              <Save className="h-4 w-4" aria-hidden="true" />
              Save line
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Fee component" htmlFor="fee_component_id" required className="sm:col-span-2">
              <select id="fee_component_id" className="gf-select" name="fee_component_id" required defaultValue="">
                <option value="" disabled>
                  Select component
                </option>
                {componentRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount" htmlFor="amount" required>
              <input
                id="amount"
                className="gf-input text-right tabular-nums"
                name="amount"
                type="number"
                step="0.01"
                min="0.01"
                required
              />
            </Field>
          </div>
        </FormSection>
      </form>

      <Card>
        <CardHeader title="Fee lines" description={`${lineRows.length} line${lineRows.length === 1 ? "" : "s"}`} />
        {lineRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[420px]">
              <thead>
                <tr>
                  <th>Component</th>
                  <th className="text-right">Amount</th>
                  <th className="text-right">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lineRows.map((l) => (
                  <tr key={l.id}>
                    <td className="font-semibold text-slate-900">{firstOrNull(l.fee_components)?.name ?? "—"}</td>
                    <td className="whitespace-nowrap text-right tabular-nums">{fmtMoney(l.amount, scheduleRow.currency)}</td>
                    <td className="w-px text-right">
                      <form action={removeLine} className="inline">
                        <input type="hidden" name="line_id" value={l.id} />
                        <SubmitButton
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
                          pendingText="Removing…"
                          showSpinner={false}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Remove
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/80 font-semibold text-slate-900">
                  <td className="px-4 py-3 pl-5 sm:pl-6">Total</td>
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{fmtMoney(total, scheduleRow.currency)}</td>
                  <td className="px-4 py-3 pr-5 sm:pr-6" />
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <EmptyState icon={ListPlus} title="No lines yet" description="Add fee components and amounts using the form above." />
        )}
      </Card>
    </div>
  );
}
