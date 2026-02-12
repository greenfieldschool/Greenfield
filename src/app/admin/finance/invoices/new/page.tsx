import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

    if (!billToGuardianId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

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

    if (error || !data?.id) return;

    revalidatePath("/admin/finance/invoices");
    redirect(`/admin/finance/invoices/${data.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Finance</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">New invoice</h1>
        <p className="mt-2 text-sm text-slate-600">Create an invoice. The invoice number is generated automatically.</p>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/invoices">
            Back to invoices
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <form action={createInvoice} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Bill to guardian</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="bill_to_guardian_id"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select guardian
              </option>
              {guardianRows.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Student (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="student_id"
              defaultValue=""
            >
              <option value="">—</option>
              {studentRows.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.last_name} {s.first_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Currency</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="currency"
              defaultValue="NGN"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Academic year (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_year_id"
              defaultValue=""
            >
              <option value="">—</option>
              {yearRows.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Academic term (optional)</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_term_id"
              defaultValue=""
            >
              <option value="">—</option>
              {termRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Issue date</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="issue_date"
              type="date"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Due date (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="due_date"
              type="date"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Notes (optional)</label>
            <textarea
              className="mt-1 min-h-28 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="notes"
            />
          </div>

          <div className="sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Create invoice
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
