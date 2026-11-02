import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { codeProblem, normalizeCode, suggestPaymentCode, transferDescription } from "@/lib/payment-codes";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { Plus, Tags } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { toastUrl } from "../../_components/finance-server";

type RevenueCategoryRow = {
  id: string;
  name: string;
  description: string | null;
  payment_code: string | null;
};

const PATH = "/admin/finance/fees/revenue-categories";
const MIGRATION_MISSING =
  "Payment IDs are not set up in the database yet. Run docs/migrations/20261101_payment_ids_bank_inbox.sql in Supabase.";

function failMessage(message: string) {
  if (/payment_code/.test(message) && /column|schema cache/i.test(message)) return MIGRATION_MISSING;
  if (/revenue_categories_payment_code_uidx|duplicate key/i.test(message) && /payment_code/.test(message)) return "That payment ID is already used by another fee type.";
  return message;
}

// Server actions live at module level so they cannot accidentally capture values from the page render.

async function takenCodes(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>, exceptId?: string) {
  const { data } = await supabase.from("revenue_categories").select("id, payment_code").not("payment_code", "is", null);
  return new Set(
    ((data ?? []) as Array<{ id: string; payment_code: string }>).filter((r) => r.id !== exceptId).map((r) => r.payment_code.toUpperCase())
  );
}

async function createCategory(formData: FormData) {
  "use server";

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const codeRaw = normalizeCode(String(formData.get("payment_code") ?? ""));

  if (!name) redirect(toastUrl(PATH, "Enter a name", "error"));

  const supabase = getSupabaseServerClient();
  if (!supabase) redirect(toastUrl(PATH, "Database is not configured", "error"));

  const taken = await takenCodes(supabase);
  const code = codeRaw || suggestPaymentCode(name, taken);
  const problem = codeProblem(code, taken);
  if (problem) redirect(toastUrl(PATH, problem, "error"));

  const { error } = await supabase.from("revenue_categories").insert({
    name,
    description: description.length ? description : null,
    payment_code: code
  });

  if (error) redirect(toastUrl(PATH, failMessage(error.message), "error"));

  revalidatePath(PATH);
  redirect(toastUrl(PATH, `Fee type created with payment ID ${code}`));
}

async function savePaymentId(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  const code = normalizeCode(String(formData.get("payment_code") ?? ""));
  if (!id) redirect(toastUrl(PATH, "Missing fee type", "error"));

  const supabase = getSupabaseServerClient();
  if (!supabase) redirect(toastUrl(PATH, "Database is not configured", "error"));

  const problem = codeProblem(code, await takenCodes(supabase, id));
  if (problem) redirect(toastUrl(PATH, problem, "error"));

  const { error } = await supabase.from("revenue_categories").update({ payment_code: code }).eq("id", id);
  if (error) redirect(toastUrl(PATH, failMessage(error.message), "error"));

  revalidatePath(PATH);
  revalidatePath("/admin/finance/payments/import");
  redirect(toastUrl(PATH, `Payment ID saved: ${code}`));
}

export default async function AdminRevenueCategoriesPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  // "*" so the page still loads before the payment_code column has been added.
  const { data } = await supabase.from("revenue_categories").select("*").order("name");
  const categories = (data ?? []) as RevenueCategoryRow[];
  const migrationNeeded = categories.length > 0 && categories.every((c) => !("payment_code" in c));
  const sample = categories.find((c) => c.payment_code)?.payment_code ?? "SF";

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/finance/fees", label: "Back to fee setup" }}
        eyebrow="Finance"
        title="Fee types & payment IDs"
        description="Define what parents pay for (e.g. School fees, Uniform, Transport). Each one has a short payment ID that parents write in the bank transfer description."
      />

      {migrationNeeded ? (
        <Alert tone="danger" title="Payment IDs are not set up in the database yet">
          Run docs/migrations/20261101_payment_ids_bank_inbox.sql in Supabase, then reload.
        </Alert>
      ) : (
        <Alert tone="info" title="How parents use the payment ID">
          <p className="mt-1">
            In the transfer description they write the child&apos;s admission number and the payment ID, for example{" "}
            <code className="rounded bg-white/70 px-1.5 py-0.5 font-mono text-[13px]">{transferDescription("GRE/2026/447", sample)}</code>. When the bank statement
            or alert is added under Payments, each payment is matched to the child and the unpaid invoice automatically. Print the IDs on fee notices and
            invoices.
          </p>
        </Alert>
      )}

      <form action={createCategory}>
        <FormSection
          title="Add fee type"
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create fee type
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name" htmlFor="name" required>
              <input id="name" className="gf-input" name="name" placeholder="School fees" required />
            </Field>
            <Field label="Payment ID" htmlFor="payment_code" hint="2 to 8 letters or numbers. Leave blank to choose one automatically (School fees → SF).">
              <input id="payment_code" className="gf-input font-mono uppercase" name="payment_code" placeholder="SF" maxLength={8} />
            </Field>
            <Field label="Description" htmlFor="description">
              <input id="description" className="gf-input" name="description" placeholder="(optional)" />
            </Field>
          </div>
        </FormSection>
      </form>

      <Card>
        <CardHeader title="All fee types" description={`${categories.length} total. Change a payment ID and press Save.`} />
        {categories.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table">
              <thead>
                <tr>
                  <th className="w-1/3">Name</th>
                  <th>Description</th>
                  <th className="w-64">Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((c) => (
                  <tr key={c.id}>
                    <td className="font-semibold text-slate-900">{c.name}</td>
                    <td>{c.description ?? "—"}</td>
                    <td>
                      <form action={savePaymentId} className="flex items-center gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input
                          className="gf-input w-28 px-2.5 py-1.5 font-mono uppercase"
                          name="payment_code"
                          defaultValue={c.payment_code ?? ""}
                          maxLength={8}
                          aria-label={`Payment ID for ${c.name}`}
                          placeholder="—"
                        />
                        <SubmitButton variant="secondary" size="sm" pendingText="Saving…" showSpinner={false}>
                          Save
                        </SubmitButton>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Tags} title="No fee types yet" description="Use the form above to add the first one." />
        )}
      </Card>
    </div>
  );
}
