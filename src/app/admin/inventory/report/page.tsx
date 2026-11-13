import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkTabs } from "@/components/ui/tabs";
import PrintButton from "@/components/print-button";
import { LEARN } from "@/lib/learn-guides";
import { formatLagosDate, toLagosDateInput } from "@/lib/lagos-dates";
import { CONDITIONS, MISSING_DB, SCHOOL_PARTS, needsAttention, schoolPartLabel, type InventoryItem } from "@/lib/inventory";
import { loadInventorySetup, loadItems } from "../_data";

// Inventory report (issue 11): totals, condition, where things are, and what needs repair or replacing. Prints.

type Totals = { lines: number; pieces: number; qty_new: number; qty_good: number; qty_fair: number; qty_damaged: number; qty_replace: number };
const empty = (): Totals => ({ lines: 0, pieces: 0, qty_new: 0, qty_good: 0, qty_fair: 0, qty_damaged: 0, qty_replace: 0 });
function add(t: Totals, i: InventoryItem) {
  t.lines += 1;
  t.pieces += i.quantity;
  for (const c of CONDITIONS) t[c.column] += i[c.column];
}
function group(items: InventoryItem[], key: (i: InventoryItem) => string) {
  const m = new Map<string, Totals>();
  for (const i of items) {
    const k = key(i);
    if (!m.has(k)) m.set(k, empty());
    add(m.get(k)!, i);
  }
  return m;
}

function TotalsTable({ title, rows, firstHeading }: { title: string; rows: Array<{ label: string; t: Totals }>; firstHeading: string }) {
  const all = empty();
  for (const r of rows) for (const k of Object.keys(all) as Array<keyof Totals>) all[k] += r.t[k];
  return (
    <Card className="break-inside-avoid">
      <CardHeader title={title} />
      <CardBody className="p-0">
        <div className="gf-table-wrap">
          <table className="gf-table">
            <thead>
              <tr>
                <th>{firstHeading}</th>
                <th className="text-right">Lines</th>
                <th className="text-right">Total</th>
                {CONDITIONS.map((c) => (
                  <th key={c.key} className="text-right">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="font-medium">{r.label}</td>
                  <td className="text-right tabular-nums">{r.t.lines}</td>
                  <td className="text-right font-semibold tabular-nums">{r.t.pieces}</td>
                  {CONDITIONS.map((c) => (
                    <td key={c.key} className={`text-right tabular-nums ${(c.key === "damaged" || c.key === "replace") && r.t[c.column] ? "font-semibold text-red-700" : ""}`}>
                      {r.t[c.column] || "—"}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="bg-slate-50 font-semibold">
                <td>All</td>
                <td className="text-right tabular-nums">{all.lines}</td>
                <td className="text-right tabular-nums">{all.pieces}</td>
                {CONDITIONS.map((c) => (
                  <td key={c.key} className="text-right tabular-nums">
                    {all[c.column] || "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  );
}

export default async function InventoryReportPage({ searchParams }: { searchParams?: { part?: string } }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const setup = await loadInventorySetup(supabase);
  const all = setup.missing ? [] : await loadItems(supabase);
  const part = SCHOOL_PARTS.some((p) => p.value === searchParams?.part) ? (searchParams?.part as string) : "";
  const items = part ? all.filter((i) => i.school_part === part) : all;

  const sectionName = new Map(setup.sections.map((s) => [s.id, s.name]));
  const locationName = new Map(setup.locations.map((l) => [l.id, l.name]));

  const bySection = group(items, (i) => i.section_id);
  const sectionRows = setup.sections.filter((s) => bySection.has(s.id)).map((s) => ({ label: s.name, t: bySection.get(s.id)! }));
  const byPart = group(items, (i) => i.school_part);
  const partRows = SCHOOL_PARTS.filter((p) => byPart.has(p.value)).map((p) => ({ label: p.label, t: byPart.get(p.value)! }));
  const byLocation = group(items, (i) => i.location_id ?? "");
  const locationRows = Array.from(byLocation.entries())
    .map(([id, t]) => ({ label: id ? locationName.get(id) ?? "—" : "No location set", t }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const attention = items
    .filter((i) => needsAttention(i) > 0)
    .sort((a, b) => b.qty_replace - a.qty_replace || b.qty_damaged - a.qty_damaged || a.name.localeCompare(b.name));
  const notCounted = items.filter((i) => !i.last_checked_on).length;

  return (
    <div className="space-y-6">
      <PageHeader
        learn={LEARN.inventory}
        back={{ href: "/admin/inventory", label: "Back to inventory" }}
        eyebrow="Inventory"
        title="Inventory report"
        description={`${part ? schoolPartLabel(part) : "Whole school"} · as at ${formatLagosDate(toLagosDateInput(new Date().toISOString()))}`}
        actions={<PrintButton label="Print report" />}
      />
      {setup.missing ? (
        <Alert tone="warning" title="Not set up yet">
          {MISSING_DB}
        </Alert>
      ) : null}

      <div className="print:hidden">
        <LinkTabs
          active={part || "all"}
          tabs={[
            { key: "all", label: "Whole school", href: "/admin/inventory/report" },
            ...SCHOOL_PARTS.filter((p) => p.value !== "whole_school").map((p) => ({ key: p.value, label: p.label, href: `/admin/inventory/report?part=${p.value}` }))
          ]}
        />
      </div>

      {items.length === 0 ? (
        <EmptyState title="Nothing recorded yet" description="Add items to the inventory and this report fills in." />
      ) : (
        <>
          {notCounted ? (
            <Alert tone="info" className="print:hidden">
              {notCounted} of {items.length} lines have no &ldquo;last counted&rdquo; date. Set it when you do a stock count, so the report shows how up to date it is.
            </Alert>
          ) : null}
          <TotalsTable title="By section" firstHeading="Section" rows={sectionRows} />
          {!part ? <TotalsTable title="By part of the school" firstHeading="Part" rows={partRows} /> : null}
          <TotalsTable title="By location" firstHeading="Location" rows={locationRows} />

          <Card className="break-inside-avoid" id="replace">
            <CardHeader title="Needs repair or replacing" description="Damaged items and items due for replacement, biggest numbers first. Use it to plan repairs and the budget." />
            <CardBody className="p-0">
              {attention.length === 0 ? (
                <p className="px-5 py-4 text-sm text-slate-500">Nothing is marked damaged or due for replacement.</p>
              ) : (
                <div className="gf-table-wrap">
                  <table className="gf-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Section</th>
                        <th>Location</th>
                        <th className="text-right">Damaged</th>
                        <th className="text-right">Due for replacement</th>
                        <th className="text-right">Of total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {attention.map((i) => (
                        <tr key={i.id}>
                          <td>
                            <Link className="gf-link" href={`/admin/inventory/${i.id}`}>
                              {i.name}
                            </Link>
                            <span className="ml-1 text-xs text-slate-500">{schoolPartLabel(i.school_part)}</span>
                          </td>
                          <td className="text-sm">{sectionName.get(i.section_id) ?? "—"}</td>
                          <td className="text-sm">{i.location_id ? locationName.get(i.location_id) ?? "—" : "—"}</td>
                          <td className="text-right tabular-nums">{i.qty_damaged || "—"}</td>
                          <td className="text-right font-semibold tabular-nums">{i.qty_replace || "—"}</td>
                          <td className="text-right tabular-nums text-slate-500">{i.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
