import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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
  fee_components: { id: string; name: string } | null;
};

function asMoney(n: number) {
  return Number(n ?? 0).toLocaleString();
}

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
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Schedule not found</h1>
        <div className="mt-4">
          <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/fees/schedules">
            Back
          </Link>
        </div>
      </div>
    );
  }

  const componentRows = (components ?? []) as ComponentRow[];
  const lineRows = (lines ?? []) as unknown as LineRow[];

  const total = lineRows.reduce((sum, l) => sum + Number(l.amount ?? 0), 0);

  async function addLine(formData: FormData) {
    "use server";

    const feeComponentId = String(formData.get("fee_component_id") ?? "").trim();
    const amount = Number(String(formData.get("amount") ?? "0").trim() || "0");

    if (!feeComponentId) return;
    if (!Number.isFinite(amount) || amount <= 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("fee_schedule_lines").upsert({
      fee_schedule_id: id,
      fee_component_id: feeComponentId,
      amount
    });

    revalidatePath(`/admin/finance/fees/schedules/${id}`);
  }

  async function removeLine(formData: FormData) {
    "use server";

    const lineId = String(formData.get("line_id") ?? "").trim();
    if (!lineId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("fee_schedule_lines").delete().eq("id", lineId);
    revalidatePath(`/admin/finance/fees/schedules/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Fee schedule</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">{scheduleRow.name}</h1>
        <div className="mt-2 text-sm text-slate-700">
          Total: <span className="font-semibold">{scheduleRow.currency} {asMoney(total)}</span>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Add / update line</h2>
        <form action={addLine} className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Fee component</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="fee_component_id"
              required
              defaultValue=""
            >
              <option value="" disabled>
                Select component
              </option>
              {componentRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Amount</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
            />
          </div>

          <div className="flex items-end sm:col-span-3">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Save line
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-8">Component</div>
          <div className="col-span-3 text-right">Amount</div>
          <div className="col-span-1">Remove</div>
        </div>
        <div>
          {lineRows.length ? (
            lineRows.map((l) => (
              <div key={l.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-8 font-semibold text-slate-900">{l.fee_components?.name ?? "—"}</div>
                <div className="col-span-3 text-right text-slate-700">
                  {scheduleRow.currency} {asMoney(l.amount)}
                </div>
                <div className="col-span-1">
                  <form action={removeLine}>
                    <input type="hidden" name="line_id" value={l.id} />
                    <button className="text-xs font-semibold text-rose-700 hover:underline" type="submit">
                      Remove
                    </button>
                  </form>
                </div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No lines yet.</div>
          )}
        </div>
      </div>

      <div>
        <Link className="text-sm font-semibold text-brand-green hover:underline" href="/admin/finance/fees/schedules">
          Back to schedules
        </Link>
      </div>
    </div>
  );
}
