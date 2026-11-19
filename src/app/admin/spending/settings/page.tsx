import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { LEARN } from "@/lib/learn-guides";
import { formatLagosDateTime } from "@/lib/lagos-dates";
import { naira } from "@/lib/spending";
import { loadViewer } from "../_data";
import { saveSettingsAction, setPermissionAction } from "../actions";

// Who may approve (and up to how much) and who may pay out; the rules. Super admins change them; admins can look.

const ROLE_LABEL: Record<string, string> = { super_admin: "Super admin", admin: "Admin", teacher: "Teacher", front_desk: "Front desk", nurse: "Nurse" };
const SETTING_LABEL: Record<string, string> = {
  second_approval_above: "Two approvals above",
  approver_may_pay_up_to: "An approver may also pay out up to",
  account_within_days: "Working days to account for an advance",
  no_receipt_max: "Biggest item without a receipt a cashier may accept",
  split_check_amount: "Flag possible split purchases around",
  low_balance_alert: "Warn when the wallet falls below",
  approve_up_to: "Can approve up to",
  can_pay_out: "Can pay out"
};

function fmtChange(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (key === "account_within_days") return String(v);
  return naira(Number(v));
}

export default async function SpendingSettingsPage({ searchParams }: { searchParams?: { toast?: string } }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const me = await loadViewer(supabase);
  if (!me) return null;
  const canEdit = me.isSuperAdmin;

  const [permsRes, staffRes, setRes, logRes] = await Promise.all([
    supabase.from("spending_permissions").select("user_id, approve_up_to, can_pay_out, updated_at"),
    supabase.from("profiles").select("id, full_name, email, role").in("role", ["super_admin", "admin", "teacher", "front_desk", "nurse"]).order("full_name"),
    supabase.from("spending_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("spending_permission_log").select("id, subject, user_name, changes, note, done_by_name, done_at").order("done_at", { ascending: false }).limit(50)
  ]);
  const staff = (staffRes.data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string }>;
  const nameOf = new Map(staff.map((s) => [s.id, s.full_name || s.email || "Staff"]));
  const roleOf = new Map(staff.map((s) => [s.id, s.role]));
  const perms = ((permsRes.data ?? []) as Array<{ user_id: string; approve_up_to: number | null; can_pay_out: boolean; updated_at: string }>)
    .filter((p) => p.approve_up_to || p.can_pay_out)
    .sort((a, b) => Number(b.approve_up_to ?? 0) - Number(a.approve_up_to ?? 0));
  const s = setRes.data as Record<string, number | null> | null;
  const log = (logRes.data ?? []) as Array<{ id: number; subject: string; user_name: string | null; changes: Record<string, [unknown, unknown]>; note: string | null; done_by_name: string | null; done_at: string }>;
  const payers = perms.filter((p) => p.can_pay_out).length;
  const approvers = perms.filter((p) => p.approve_up_to).length;

  return (
    <div className="space-y-6">
      <UrlToast key={searchParams?.toast ?? "none"} />
      <PageHeader
        learn={LEARN.spending}
        back={{ href: "/admin/spending", label: "Back to spending requests" }}
        eyebrow="Spending requests"
        title="Who approves and pays"
        description="Approvers can approve requests up to their limit. Cashiers pay out and check receipts. Nobody approves or pays their own request."
      />
      {!canEdit ? <Alert tone="info">Only a super admin can change these. Every change is recorded below.</Alert> : null}
      {!approvers || !payers ? (
        <Alert tone="warning" title="Not ready yet">
          {!approvers ? "No one can approve requests yet. " : ""}
          {!payers ? "No one can pay out yet. " : ""}Give at least one approver and one cashier (two of each is safer, for when someone is away).
        </Alert>
      ) : null}

      <Card>
        <CardHeader title="People with spending permissions" />
        {perms.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[560px]">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th className="text-right">Can approve up to</th>
                  <th>Can pay out</th>
                  <th>Changed</th>
                </tr>
              </thead>
              <tbody>
                {perms.map((p) => (
                  <tr key={p.user_id}>
                    <td className="font-medium">{nameOf.get(p.user_id) ?? "Former staff"}</td>
                    <td>{ROLE_LABEL[roleOf.get(p.user_id) ?? ""] ?? "No longer staff"}</td>
                    <td className="text-right tabular-nums">{p.approve_up_to ? naira(p.approve_up_to) : "—"}</td>
                    <td>{p.can_pay_out ? <Badge tone="green">Yes</Badge> : "—"}</td>
                    <td className="text-xs text-slate-500">{formatLagosDateTime(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CardBody>
            <p className="text-sm text-slate-600">No one yet.</p>
          </CardBody>
        )}
        {canEdit ? (
          <CardBody className="border-t border-slate-100">
            <form action={setPermissionAction} className="space-y-3">
              <p className="text-sm font-semibold text-slate-900">Give or change a permission</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block sm:col-span-1">
                  <span className="gf-label">Member of staff</span>
                  <select className="gf-select" name="user_id" required defaultValue="">
                    <option value="" disabled>
                      Choose…
                    </option>
                    {staff
                      .filter((x) => x.id !== me.userId)
                      .map((x) => (
                        <option key={x.id} value={x.id}>
                          {x.full_name || x.email} ({ROLE_LABEL[x.role] ?? x.role})
                        </option>
                      ))}
                  </select>
                </label>
                <label className="block">
                  <span className="gf-label">Can approve up to (₦, blank = can&apos;t approve)</span>
                  <input className="gf-input text-right tabular-nums" name="approve_up_to" inputMode="decimal" />
                </label>
                <label className="flex items-center gap-2 pt-6 text-sm">
                  <input type="checkbox" name="can_pay" className="h-4 w-4" />
                  Can pay out and check receipts
                </label>
              </div>
              <label className="block">
                <span className="gf-label">Note (optional)</span>
                <input className="gf-input" name="note" maxLength={300} placeholder="e.g. Bursar from November 2026" />
              </label>
              <p className="gf-hint">To remove someone, choose them, leave the limit blank and untick the box. Your own permissions must be changed by another super admin.</p>
              <SubmitButton pendingText="Saving…">Save permission</SubmitButton>
            </form>
          </CardBody>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Rules" description="Amounts are in naira." />
        <CardBody>
          {s ? (
            <form action={saveSettingsAction} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {(["second_approval_above", "approver_may_pay_up_to", "no_receipt_max", "split_check_amount", "low_balance_alert", "account_within_days"] as const).map((k) => (
                  <label key={k} className="block">
                    <span className="gf-label">{SETTING_LABEL[k]}</span>
                    <input
                      className="gf-input text-right tabular-nums"
                      name={k}
                      inputMode="decimal"
                      defaultValue={s[k] == null ? "" : String(s[k])}
                      disabled={!canEdit}
                    />
                  </label>
                ))}
              </div>
              {canEdit ? <SubmitButton pendingText="Saving…">Save rules</SubmitButton> : null}
            </form>
          ) : (
            <Alert tone="warning">Spending requests need a database update.</Alert>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Changes" description="Latest 50. Nothing here can be changed or deleted." />
        {log.length ? (
          <ul className="divide-y divide-slate-100">
            {log.map((l) => (
              <li key={l.id} className="px-4 py-3 text-sm sm:px-6">
                <p className="font-medium text-slate-900">
                  {l.subject === "settings" ? "Rules changed" : `${l.user_name ?? "Staff"}'s permission changed`}
                </p>
                <ul className="mt-1 text-xs text-slate-600">
                  {Object.entries(l.changes ?? {}).map(([k, [from, to]]) => (
                    <li key={k}>
                      {SETTING_LABEL[k] ?? k}: {fmtChange(k, from)} → {fmtChange(k, to)}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-slate-500">
                  {l.done_by_name} · {formatLagosDateTime(l.done_at)}
                  {l.note ? ` · ${l.note}` : ""}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <CardBody>
            <p className="text-sm text-slate-600">No changes yet.</p>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
