import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronLeft, ChevronRight, ExternalLink, History, Minus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { buttonClasses } from "@/components/ui/button";
import PrintButton from "@/components/print-button";
import AutoSubmitSelect from "@/components/auto-submit-select";
import { LEARN } from "@/lib/learn-guides";
import { cn } from "@/lib/cn";
import { formatLagosDate } from "@/lib/lagos-dates";
import { formatMi, type MiMetric, type MiPack, type MiSection } from "@/lib/mi-pack";
import { shortDate, type MiView } from "@/lib/mi-periods";

// The management information pack screen. Pure presentation: the page loads an MiPack and hands it here, and the
// design preview hands it sample data. Prints as a clean A4 document (shell hidden, controls hidden).

type Change = { text: string; words: string; tone: "good" | "bad" | "flat"; dir: "up" | "down" | "flat" };

function describeChange(metric: MiMetric, previousWord: string): Change | null {
  const { current, previous, format, better } = metric;
  if (current === null || previous === null) return null;
  const diff = current - previous;
  if (Math.abs(diff) < (format === "percent" ? 0.05 : 0.5)) return { text: "No change", words: `the same as ${previousWord}`, tone: "flat", dir: "flat" };
  const dir = diff > 0 ? "up" : "down";
  const tone = better === "none" ? "flat" : (better === dir ? "good" : "bad");
  let text: string;
  if (format === "percent") {
    text = `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} pts`;
  } else {
    const abs = formatMi(Math.abs(diff), format);
    const rel = previous > 0 ? ` (${Math.round((Math.abs(diff) / previous) * 100)}%)` : "";
    text = `${diff > 0 ? "+" : "−"}${abs}${rel}`;
  }
  return { text, words: `${dir} ${text.replace(/^[+−]/, "")} on ${previousWord}`, tone, dir };
}

const toneClass = {
  good: "bg-brand-green-50 text-brand-green-800 ring-brand-green-200",
  bad: "bg-red-50 text-red-700 ring-red-200",
  flat: "bg-slate-100 text-slate-600 ring-slate-200"
};

function ChangeChip({ metric, previousWord, className }: { metric: MiMetric; previousWord: string; className?: string }) {
  const c = describeChange(metric, previousWord);
  if (!c) return <span className={cn("text-xs text-slate-400", className)}>No comparison</span>;
  const Icon = c.dir === "up" ? ArrowUpRight : c.dir === "down" ? ArrowDownRight : Minus;
  return (
    <span
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", toneClass[c.tone], className)}
      title={`Compared with ${previousWord}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{c.words}</span>
      <span aria-hidden="true">{c.text}</span>
    </span>
  );
}

function Headline({ pack }: { pack: MiPack }) {
  const word = pack.period.previousWord;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 print:grid-cols-3">
      {pack.headline.map((h) => (
        <div key={h.label} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card print:shadow-none sm:p-5">
          <div className="text-sm font-medium text-slate-500">{h.label}</div>
          <div className="mt-1.5 text-xl font-bold tracking-tight text-slate-900 sm:text-[1.6rem]">{formatMi(h.current, h.format)}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <ChangeChip metric={h} previousWord={word} />
            <span className="text-xs text-slate-500">
              {word[0].toUpperCase() + word.slice(1)}: {formatMi(h.previous, h.format)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

const noteTone = { danger: "danger", warning: "warning", info: "info", success: "success" } as const;

function SectionCard({ section, previousWord, currentWord, asOf }: { section: MiSection; previousWord: string; currentWord: string; asOf: string }) {
  const prevHead = previousWord[0].toUpperCase() + previousWord.slice(1);
  return (
    <Card id={section.key} className="break-inside-avoid-page print:break-inside-avoid print:shadow-none">
      <CardHeader
        title={section.title}
        description={section.description}
        action={
          section.link ? (
            <Link href={section.link.href} className="inline-flex items-center gap-1 text-sm font-semibold text-brand-green-700 hover:underline print:hidden">
              <span className="hidden sm:inline">{section.link.label}</span>
              <span className="sm:hidden">Open</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : undefined
        }
      />
      <CardBody className="space-y-5">
        {section.unavailable ? <Alert tone="warning">{section.unavailable}</Alert> : null}

        <div role="table" aria-label={section.title} className="text-sm">
          <div role="row" className="hidden grid-cols-[1fr_8rem_8rem_9rem] gap-3 border-b border-slate-100 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid print:grid">
            <span role="columnheader">Figure</span>
            <span role="columnheader" className="text-right">{currentWord}</span>
            <span role="columnheader" className="text-right">{prevHead}</span>
            <span role="columnheader" className="text-right">Change</span>
          </div>
          {section.metrics.map((mt) => (
            <div
              role="row"
              key={mt.label}
              className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 border-b border-slate-100 py-2.5 last:border-0 sm:grid-cols-[1fr_8rem_8rem_9rem] print:grid-cols-[1fr_8rem_8rem_9rem]"
            >
              <span role="rowheader" className="min-w-0 text-slate-700">
                {mt.label}
                {mt.hint ? <span className="block text-xs text-slate-500">{mt.hint}</span> : null}
              </span>
              <span role="cell" className="text-right font-semibold tabular-nums text-slate-900">
                {formatMi(mt.current, mt.format)}
              </span>
              <span role="cell" className="col-span-2 flex items-center justify-end gap-2 text-xs text-slate-500 sm:hidden print:hidden">
                {prevHead}: {formatMi(mt.previous, mt.format)}
                <ChangeChip metric={mt} previousWord={previousWord} />
              </span>
              <span role="cell" className="hidden text-right tabular-nums text-slate-500 sm:block print:block">
                {formatMi(mt.previous, mt.format)}
              </span>
              <span role="cell" className="hidden text-right sm:block print:block">
                <ChangeChip metric={mt} previousWord={previousWord} />
              </span>
            </div>
          ))}
        </div>

        {section.snapshots?.length ? (
          <div>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{asOf}</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {section.snapshots.map((s) => (
                <div key={s.label} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-inset ring-slate-100">
                  <div className="text-xs text-slate-500">{s.label}</div>
                  <div className="mt-0.5 text-base font-bold tabular-nums text-slate-900">{formatMi(s.value, s.format)}</div>
                  {s.hint ? <div className="text-[11px] text-slate-500">{s.hint}</div> : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {section.tables?.length ? (
          <div className="grid gap-5 xl:grid-cols-2 print:grid-cols-2">
            {section.tables.map((t) => {
              // Right-align columns that hold only numbers, money or percentages; text columns stay left.
              const numericCols = t.columns.map((_, i) => i > 0 && t.rows.length > 0 && t.rows.every((r) => typeof r[i] === "string" && /^[₦\d.,%—−+\s-]+$/.test(r[i] as string)));
              return (
              <div key={t.title} className={cn("min-w-0", t.wide && "xl:col-span-2 print:col-span-2")}>
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.title}</div>
                {t.rows.length ? (
                  <div className="gf-table-wrap">
                    <table className="gf-table">
                      <thead>
                        <tr>
                          {t.columns.map((c, i) => (
                            <th key={c} className={numericCols[i] ? "text-right" : undefined}>
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.rows.map((r, ri) => (
                          <tr key={ri}>
                            {r.map((cell, i) => (
                              <td key={i} className={i === 0 ? "whitespace-nowrap" : numericCols[i] ? "text-right tabular-nums" : undefined}>
                                {typeof cell === "string" ? (
                                  cell
                                ) : (
                                  <a
                                    href={cell.href}
                                    className="gf-link inline-flex items-center gap-1 whitespace-nowrap font-medium"
                                    {...(/^https?:/i.test(cell.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                                  >
                                    {cell.text}
                                    {/^https?:/i.test(cell.href) ? <ExternalLink className="h-3.5 w-3.5 print:hidden" aria-hidden="true" /> : null}
                                  </a>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">{t.empty}</p>
                )}
              </div>
              );
            })}
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}

export function MiPackView({
  pack,
  periods,
  basePath = "/admin/management-pack",
  banner,
  asOf = "As of today",
  historyHref
}: {
  pack: MiPack;
  periods: Array<{ key: string; label: string }>;
  basePath?: string;
  /** Shown under the period picker: saved copy or not, and the save buttons. */
  banner?: ReactNode;
  /** Heading over figures that have no comparison ("As of today", or the date a saved copy was made). */
  asOf?: string;
  historyHref?: string;
}) {
  const p = pack.period;
  const href = (view: MiView, key?: string | null) => `${basePath}?view=${view}${key ? `&period=${key}` : ""}`;
  const isCurrent = p.nextKey === null;
  const currentWord = p.view === "week" ? (isCurrent ? "This week" : "That week") : isCurrent ? "This month" : "That month";
  const compared = p.inProgress
    ? `${p.view === "week" ? "This week" : "This month"} so far (${shortDate(p.start)} – ${shortDate(p.end, true)}), compared with the same days ${p.previousWord} (${p.previous.label}).`
    : `Compared with ${p.previousWord} (${p.previous.label}).`;

  return (
    <div className="space-y-6 print:space-y-4">
      <PageHeader
        eyebrow="Management pack"
        title={p.label}
        description={compared}
        learn={LEARN.managementPack}
        actions={
          <div className="flex flex-wrap gap-2 print:hidden">
            {historyHref ? (
              <Link href={historyHref} className={buttonClasses({ variant: "secondary" })}>
                <History className="h-4 w-4" aria-hidden="true" />
                History
              </Link>
            ) : null}
            <PrintButton label="Print or save as PDF" variant="secondary" />
          </div>
        }
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-card sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="inline-flex rounded-xl bg-slate-100 p-1" role="group" aria-label="Weekly or monthly pack">
          {(["week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={href(v)}
              aria-current={p.view === v ? "page" : undefined}
              className={cn(
                "rounded-lg px-4 py-1.5 text-sm font-semibold transition",
                p.view === v ? "bg-white text-brand-green-800 shadow-sm" : "text-slate-600 hover:text-slate-900"
              )}
            >
              {v === "week" ? "Weekly" : "Monthly"}
            </Link>
          ))}
        </div>
        <form method="get" action={basePath} className="flex items-center gap-2">
          <input type="hidden" name="view" value={p.view} />
          <Link href={href(p.view, p.prevKey)} className={buttonClasses({ variant: "secondary", size: "sm" })} aria-label={`Previous ${p.view}`}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <label className="sr-only" htmlFor="mi-period">
            Choose the {p.view}
          </label>
          <AutoSubmitSelect id="mi-period" name="period" defaultValue={p.key} className="gf-select min-w-0 flex-1 sm:w-72">
            {periods.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </AutoSubmitSelect>
          {p.nextKey ? (
            <Link href={href(p.view, p.nextKey)} className={buttonClasses({ variant: "secondary", size: "sm" })} aria-label={`Next ${p.view}`}>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "pointer-events-none opacity-40")} aria-hidden="true">
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
          <noscript>
            <button type="submit" className={buttonClasses({ size: "sm" })}>
              Show
            </button>
          </noscript>
        </form>
      </div>

      {banner}

      <Headline pack={pack} />

      <Card className="print:shadow-none">
        <CardHeader title="Worth a look" description="Picked out automatically from the figures below." />
        <CardBody className="space-y-2">
          {pack.notes.map((n) => (
            <Alert key={n.text} tone={noteTone[n.tone]}>
              {n.text}
            </Alert>
          ))}
        </CardBody>
      </Card>

      <nav aria-label="Sections" className="flex gap-2 overflow-x-auto pb-1 print:hidden">
        {pack.sections.map((s) => (
          <a key={s.key} href={`#${s.key}`} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-sm font-medium text-slate-600 ring-1 ring-slate-200 hover:text-brand-green-700">
            {s.title}
          </a>
        ))}
      </nav>

      {pack.sections.map((s) => (
        <SectionCard key={s.key} section={s} previousWord={p.previousWord} currentWord={currentWord} asOf={asOf} />
      ))}

      <p className="text-xs text-slate-500">
        Worked out {formatLagosDate(pack.generatedAt)} from the records in the school system. Green changes are good news, red ones
        need a look, grey ones are neither. Figures under “{asOf.toLowerCase()}” are a count at that moment and have no comparison.
      </p>
    </div>
  );
}
