import Link from "next/link";
import { History } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/tabs";
import { Field } from "@/components/ui/form-section";
import SubmitButton from "@/components/submit-button";
import PrintButton from "@/components/print-button";
import { LEARN } from "@/lib/learn-guides";
import { formatLagosDate, formatLagosDateTime } from "@/lib/lagos-dates";
import { LOG_ACTIONS, LOG_COLUMNS, LOG_SUBJECTS, MISSING_DB, describeLogRow, isMissingTable, type InventoryLogRow } from "@/lib/inventory";
import { loadInventorySetup } from "../_data";

// Inventory history: every item added, changed, deactivated (with the reason) or reactivated, across the whole
// register, newest first. Inventory can't be deleted; early "deleted" rows (before that rule) still show. Admins only (route-access + RLS on inventory_log).

const LIMIT = 500;
type SP = { section?: string; action?: string; about?: string; from?: string; to?: string; q?: string };
const isDate = (v: string | undefined) => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export default async function InventoryHistoryPage({ searchParams }: { searchParams?: SP }) {
  const sp = searchParams ?? {};
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const setup = await loadInventorySetup(supabase);

  const sectionId = setup.sections.some((s) => s.id === sp.section) ? (sp.section as string) : "all";
  const action = LOG_ACTIONS.some((a) => a.value === sp.action) ? (sp.action as string) : "";
  const about = LOG_SUBJECTS.some((a) => a.value === sp.about) ? (sp.about as string) : "";
  const from = isDate(sp.from) ? (sp.from as string) : "";
  const to = isDate(sp.to) ? (sp.to as string) : "";
  const term = (sp.q ?? "").replace(/[,()%*\\]/g, " ").trim().slice(0, 60);

  let query = supabase.from("inventory_log").select(LOG_COLUMNS);
  if (sectionId !== "all") query = query.eq("section_id", sectionId);
  if (action) query = query.eq("action", action);
  if (about) query = query.eq("subject", about);
  if (from) query = query.gte("created_at", `${from}T00:00:00+01:00`);
  if (to) query = query.lte("created_at", `${to}T23:59:59.999+01:00`);
  if (term) query = query.or(`item_name.ilike.%${term}%,done_by_name.ilike.%${term}%`);
  const { data, error } = setup.missing
    ? { data: [], error: null }
    : await query.order("created_at", { ascending: false }).order("id").limit(LIMIT + 1);
  const missingColumn = !!error && isMissingTable(error.message);
  const rows = ((data ?? []) as InventoryLogRow[]).slice(0, LIMIT);
  const more = (data ?? []).length > LIMIT;

  // Which logged items still exist (deleted items' rows have no link).
  const names = {
    sections: new Map(setup.sections.map((s) => [s.id, s.name])),
    locations: new Map(setup.locations.map((l) => [l.id, l.name]))
  };
  const actionInfo = new Map(LOG_ACTIONS.map((a) => [a.value, a]));
  const subjectShort = new Map(LOG_SUBJECTS.map((a) => [a.value, a.short]));

  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (action) p.set("action", action);
    if (about) p.set("about", about);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (sp.q) p.set("q", sp.q);
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v);
    const s = p.toString();
    return `/admin/inventory/history${s ? `?${s}` : ""}`;
  };

  const period = from || to ? `${from ? formatLagosDate(from) : "the start"} to ${to ? formatLagosDate(to) : "today"}` : "All dates";

  return (
    <div className="space-y-6">
      <PageHeader
        learn={LEARN.inventory}
        back={{ href: "/admin/inventory", label: "Back to inventory" }}
        eyebrow="Inventory"
        title="Inventory history"
        description="Every item added, changed, deactivated or reactivated, and every change to sections, usual items and locations, with who did it and when."
        actions={<PrintButton label="Print" variant="secondary" />}
      />

      {setup.missing || missingColumn ? (
        <Alert tone="warning" title="Not set up yet">
          {MISSING_DB} (Running it again is safe; it adds what the history page needs.)
        </Alert>
      ) : error ? (
        <Alert tone="danger" title="The history couldn't be loaded">
          {error.message}
        </Alert>
      ) : null}

      <div className="print:hidden">
        <LinkTabs
          active={sectionId}
          tabs={[
            { key: "all", label: "All sections", href: keep({}) },
            ...setup.sections.map((s) => ({ key: s.id, label: s.name, href: keep({ section: s.id }) }))
          ]}
        />
      </div>

      <Card className="print:hidden">
        <CardBody>
          <form method="get" action="/admin/inventory/history" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_auto] lg:items-end">
            {sectionId !== "all" ? <input type="hidden" name="section" value={sectionId} /> : null}
            <Field label="Item or person" htmlFor="h-q">
              <input id="h-q" name="q" defaultValue={sp.q ?? ""} className="gf-input" placeholder="e.g. chairs, Mrs Adeyemi" />
            </Field>
            <Field label="What happened" htmlFor="h-action">
              <select id="h-action" name="action" defaultValue={action} className="gf-select">
                <option value="">Everything</option>
                {LOG_ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="About" htmlFor="h-about">
              <select id="h-about" name="about" defaultValue={about} className="gf-select">
                <option value="">Items and set-up lists</option>
                {LOG_SUBJECTS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From" htmlFor="h-from">
              <input id="h-from" type="date" name="from" defaultValue={from} className="gf-input" />
            </Field>
            <Field label="To" htmlFor="h-to">
              <input id="h-to" type="date" name="to" defaultValue={to} className="gf-input" />
            </Field>
            <SubmitButton variant="secondary" pendingText="Filtering…">
              Show
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <p className="hidden text-sm text-slate-600 print:block">
        {sectionId === "all" ? "All sections" : names.sections.get(sectionId)} · {about ? LOG_SUBJECTS.find((a) => a.value === about)?.label : "Items and set-up lists"} ·{" "}
        {action ? actionInfo.get(action)?.label : "Everything"} · {period}
      </p>

      {rows.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nothing to show"
          description={from || to || action || about || term || sectionId !== "all" ? "No changes match these filters." : "Changes appear here as soon as items are added to the inventory."}
        />
      ) : (
        <Card>
          <CardBody className="p-0">
            <div className="gf-table-wrap">
              <table className="gf-table">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Item</th>
                    {sectionId === "all" ? <th>Section</th> : null}
                    <th>What happened</th>
                    <th>Details</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const a = actionInfo.get(r.action);
                    const lines = describeLogRow(r, names);
                    return (
                      <tr key={r.id} className="align-top">
                        <td className="whitespace-nowrap text-sm">{formatLagosDateTime(r.created_at)}</td>
                        <td className="font-medium">
                          {r.item_id && (r.subject ?? "item") === "item" ? (
                            <Link className="gf-link" href={`/admin/inventory/${r.item_id}`}>
                              {r.item_name}
                            </Link>
                          ) : (r.subject ?? "item") === "item" ? (
                            <span title="This item has since been deleted">{r.item_name}</span>
                          ) : (
                            <>
                              <Link className="gf-link" href="/admin/inventory/settings">
                                {r.item_name}
                              </Link>
                              <span className="block text-xs font-normal text-slate-500">{subjectShort.get(r.subject) ?? "Set-up list"}</span>
                            </>
                          )}
                        </td>
                        {sectionId === "all" ? <td className="text-sm">{r.section_id ? names.sections.get(r.section_id) ?? "—" : "—"}</td> : null}
                        <td>
                          <Badge tone={a?.tone ?? "slate"}>{a?.label ?? r.action}</Badge>
                        </td>
                        <td className="text-xs text-slate-600">
                          {lines.length ? (
                            <ul className="space-y-0.5">
                              {lines.map((t) => (
                                <li key={t}>{t}</li>
                              ))}
                            </ul>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="whitespace-nowrap text-sm">{r.done_by_name ?? "Admin"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      )}
      {more ? (
        <p className="text-sm text-slate-500">Showing the latest {LIMIT} changes. Narrow the dates or pick a section to see earlier ones.</p>
      ) : null}
    </div>
  );
}
