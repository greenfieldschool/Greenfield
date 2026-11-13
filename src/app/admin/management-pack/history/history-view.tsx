import Link from "next/link";
import { History } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import PrintButton from "@/components/print-button";
import { LEARN } from "@/lib/learn-guides";
import { cn } from "@/lib/cn";
import { formatLagosDate } from "@/lib/lagos-dates";
import { formatMi, type MiFormat, type MiPack } from "@/lib/mi-pack";
import { lagosToday, resolvePeriod, shortDate, type MiView } from "@/lib/mi-periods";
import type { SavedPack } from "@/lib/mi-history";

// Saved management packs, one row per finished week or month, with the key figures side by side so leadership can
// see how they moved over time. Pure presentation (the design preview uses it too).

const COLUMNS: Array<{ id: string; label: string; format: MiFormat; monthOnly?: boolean }> = [
  { id: "attendance", label: "Attendance", format: "percent" },
  { id: "collected", label: "Fees collected", format: "money" },
  { id: "spent", label: "Spent", format: "money" },
  { id: "enquiries", label: "Enquiries", format: "count" },
  { id: "incidents", label: "Incidents", format: "count" },
  { id: "handedIn", label: "Work handed in", format: "count" },
  { id: "onRoll", label: "Pupils on roll", format: "count" },
  { id: "teachersActive", label: "Teachers active", format: "count" },
  { id: "starVideosRate", label: "Star videos", format: "percent" },
  { id: "headActions", label: "Head actions", format: "count" },
  { id: "owed", label: "Still owed", format: "money" },
  // The inventory is in the end-of-month pack only.
  { id: "invReplace", label: "Inventory due for replacement", format: "count", monthOnly: true }
];

/** A figure from a saved pack by its id (period figures and "as of" figures alike). */
function figure(pack: MiPack, id: string): number | null {
  for (const s of pack.sections) {
    const m = s.metrics.find((x) => x.id === id);
    if (m) return m.current;
    const sn = s.snapshots?.find((x) => x.id === id);
    if (sn) return sn.value;
  }
  return null;
}

type Line = { kind: "saved"; key: string; name: string; row: SavedPack } | { kind: "missing"; key: string; name: string };

/**
 * Finished periods from the latest one back to the oldest saved copy, so a period that was never saved shows as a
 * gap ("Not saved") instead of silently missing from the list.
 */
function lines(view: MiView, rows: SavedPack[], today = lagosToday()): Line[] {
  const byKey = new Map(rows.map((r) => [r.periodKey, r]));
  const oldest = rows.reduce((min, r) => (r.periodKey < min ? r.periodKey : min), rows[0]?.periodKey ?? "");
  const out: Line[] = [];
  let key = resolvePeriod(view, undefined, today).prevKey;
  while (key >= oldest && out.length < 120) {
    const p = resolvePeriod(view, key, today);
    const name = view === "week" ? `${shortDate(p.start)} – ${shortDate(p.fullEnd, true)}` : p.label;
    const row = byKey.get(p.key);
    out.push(row ? { kind: "saved", key: p.key, name, row } : { kind: "missing", key: p.key, name });
    key = p.prevKey;
  }
  return out;
}

export function HistoryView({
  view,
  rows,
  error,
  basePath = "/admin/management-pack"
}: {
  view: MiView;
  rows: SavedPack[];
  error: string | null;
  basePath?: string;
}) {
  const word = view === "week" ? "week" : "month";
  const columns = COLUMNS.filter((c) => !c.monthOnly || view === "month");
  const packHref = (key: string) => `${basePath}?view=${view}&period=${key}`;
  const list = rows.length ? lines(view, rows) : [];
  const saved = (r: SavedPack) => `${formatLagosDate(r.savedAt)}${r.source === "automatic" ? " · automatic" : r.savedByName ? ` · ${r.savedByName}` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: `${basePath}?view=${view}`, label: "Management pack" }}
        eyebrow="Management pack"
        title="History"
        description={`Every saved ${word}ly pack, newest first, exactly as it was when it was saved. Open one to see the whole pack.`}
        learn={LEARN.managementPack}
        actions={
          <div className="print:hidden">
            <PrintButton label="Print" variant="secondary" />
          </div>
        }
      />

      <div className="inline-flex rounded-xl bg-slate-100 p-1 print:hidden" role="group" aria-label="Weekly or monthly packs">
        {(["week", "month"] as const).map((v) => (
          <Link
            key={v}
            href={`${basePath}/history?view=${v}`}
            aria-current={view === v ? "page" : undefined}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-semibold transition", view === v ? "bg-white text-brand-green-800 shadow-sm" : "text-slate-600 hover:text-slate-900")}
          >
            {v === "week" ? "Weekly" : "Monthly"}
          </Link>
        ))}
      </div>

      {error === "missing" ? (
        <Alert tone="warning" title="History isn't switched on yet">
          Saving packs needs a database update: run 20261111_management_pack_history.sql in Supabase.
        </Alert>
      ) : error ? (
        <Alert tone="danger" title="The history could not be read just now">
          {error}
        </Alert>
      ) : !rows.length ? (
        <Card>
          <EmptyState
            icon={History}
            title={`No ${word}ly packs saved yet`}
            description={`Each ${word} is saved automatically the night after it ends, and recent ones that were missed are filled in overnight.`}
          />
        </Card>
      ) : (
        <>
          {/* Phones: one card per period. */}
          <div className="space-y-3 md:hidden print:hidden">
            {list.map((l) =>
              l.kind === "missing" ? (
                <Link key={l.key} href={packHref(l.key)} className="flex items-baseline justify-between gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                  <span>
                    <span className="block font-semibold text-slate-700">{l.name}</span>
                    <span className="text-sm text-slate-500">Not saved yet: filled in automatically overnight</span>
                  </span>
                  <span className="text-sm font-semibold text-brand-green-700">Open</span>
                </Link>
              ) : (
              <Link key={l.key} href={packHref(l.key)} className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-slate-900">{l.name}</span>
                  <span className="text-sm font-semibold text-brand-green-700">Open</span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {columns.map((c) => (
                    <div key={c.id} className="flex justify-between gap-2">
                      <dt className="text-slate-500">{c.label}</dt>
                      <dd className="font-semibold tabular-nums text-slate-900">{formatMi(figure(l.row.pack, c.id), c.format)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-3 text-xs text-slate-500">Saved {saved(l.row)}</div>
              </Link>
              )
            )}
          </div>

          {/* Wider screens and print: one table. */}
          <div className="hidden md:block print:block">
            <Card>
              <div className="gf-table-wrap">
                <table className="gf-table">
                  <thead>
                    <tr>
                      <th>{view === "week" ? "Week" : "Month"}</th>
                      {columns.map((c) => (
                        <th key={c.id} className="text-right">
                          {c.label}
                        </th>
                      ))}
                      <th>Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((l) =>
                      l.kind === "missing" ? (
                        <tr key={l.key} className="bg-slate-50/70">
                          <td className="whitespace-nowrap">
                            <Link href={packHref(l.key)} className="gf-link font-semibold">
                              {l.name}
                            </Link>
                          </td>
                          <td colSpan={columns.length} className="text-sm text-slate-500">
                            Not saved yet. Recent weeks and months are filled in automatically overnight.
                          </td>
                          <td />
                        </tr>
                      ) : (
                        <tr key={l.key}>
                          <td className="whitespace-nowrap">
                            <Link href={packHref(l.key)} className="gf-link font-semibold">
                              {l.name}
                            </Link>
                          </td>
                          {columns.map((c) => (
                            <td key={c.id} className="whitespace-nowrap text-right tabular-nums">
                              {formatMi(figure(l.row.pack, c.id), c.format)}
                            </td>
                          ))}
                          <td className="whitespace-nowrap text-xs text-slate-500">{saved(l.row)}</td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>
          <p className="text-xs text-slate-500">
            Pupils on roll and fees still owed are counted on the day the pack was saved. The other figures cover the whole {word}.
          </p>
        </>
      )}
    </div>
  );
}
