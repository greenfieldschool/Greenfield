import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Archive, CalendarDays, Download, Eye, Printer, Search, Users, X } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { formatLagosDate } from "@/lib/lagos-dates";
import { round2 } from "@/lib/results";
import { ordinal } from "@/lib/term-report";
import {
  archivePublishedResults,
  loadPublishedEntries,
  publishedKeyParams,
  publishedViewer,
  type PublishedEntry
} from "@/lib/published-results";
import { LEARN } from "@/lib/learn-guides";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";

// Published results (issue 10): every class + term whose results have been published, for school management,
// front desk (admissions) and class teachers (their own classes). Read-only: publishing and unpublishing stay on
// Report cards. Data comes from the archive copies (lib/published-results.ts).

const PATH = "/admin/academics/published";
const LEVELS: Record<string, string> = { creche: "Creche", primary: "Primary", secondary: "Secondary" };

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function url(path: string, params: Record<string, string | undefined>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
}

function back(message: string, type: "success" | "error" = "success"): never {
  redirect(url(PATH, { toast: message, toast_type: type }));
}

// Admins: save copies for results published before the archive existed (worked out from today's records).
async function saveMissingCopies() {
  "use server";
  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) back("Database is not configured", "error");
  const { isAdmin } = await publishedViewer(supabase);
  if (!isAdmin) back("Only an admin can save copies", "error");
  if (!getSupabaseServiceClient()) back("Copies can't be saved: the school's service key is not set on the server.", "error");

  const { entries } = await loadPublishedEntries(supabase, { kind: "all" });
  const missing = entries.filter((e) => !e.copyId && e.classId);
  let saved = 0;
  const failed: string[] = [];
  for (const e of missing) {
    const result = await archivePublishedResults(e.classId as string, e.termId);
    if (result.ok) saved += 1;
    else failed.push(`${e.className} ${e.termName}`);
  }
  revalidatePath(PATH);
  if (failed.length) back(`Saved ${saved} cop${saved === 1 ? "y" : "ies"}. Not saved: ${failed.slice(0, 5).join(", ")}${failed.length > 5 ? "…" : ""}`, "error");
  back(saved ? `Saved ${saved} cop${saved === 1 ? "y" : "ies"}` : "Every published result already has a copy");
}

function termLabel(e: Pick<PublishedEntry, "yearName" | "termName">) {
  return [e.yearName, e.termName].filter(Boolean).join(" · ");
}

function classLabel(e: Pick<PublishedEntry, "classLevel" | "className">) {
  return `${LEVELS[e.classLevel] ?? e.classLevel} · ${e.className}`;
}

export default async function PublishedResultsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};

  const { scope, isAdmin } = await publishedViewer(supabase);

  const header = (
    <PageHeader
      learn={LEARN.publishedResults}
      eyebrow="Result management"
      title="Published results"
      description="Every class result that has been published to parents, by session and term. Open a class to see its results, print its report cards or download them for Excel."
      actions={
        isAdmin ? (
          <ButtonLink href="/admin/academics/reports" variant="secondary" size="sm">
            Publish or unpublish
          </ButtonLink>
        ) : undefined
      }
    />
  );

  if (scope.kind === "none") {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={Archive}
            title="Published results are for school management, front desk and class teachers"
            description="Ask an admin if you need to see a class's published results."
          />
        </Card>
      </div>
    );
  }
  if (scope.kind === "own" && !scope.classIds.length) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={Archive}
            title="You're not the class teacher of any class"
            description="Class teachers see the published results of their own classes here. Ask an admin to assign you as class teacher under Teacher assignments."
          />
        </Card>
      </div>
    );
  }

  const { entries, archiveReady, error } = await loadPublishedEntries(supabase, scope);

  // Filters. The choices come from what has actually been published, so no choice leads to an empty list.
  const yearId = str(sp.year_id);
  const termId = str(sp.term_id);
  const level = str(sp.level);
  const classKey = str(sp.class);
  const q = str(sp.q);
  const filtered = entries.filter(
    (e) =>
      (!yearId || e.yearId === yearId) &&
      (!termId || e.termId === termId) &&
      (!level || e.classLevel === level) &&
      (!classKey || (e.classId ?? `copy:${e.copyId}`) === classKey)
  );
  const anyFilter = Boolean(yearId || termId || level || classKey || q);

  const years = Array.from(new Map(entries.filter((e) => e.yearId).map((e) => [e.yearId as string, e.yearName ?? "Session"])).entries());
  const terms = Array.from(
    new Map(entries.filter((e) => !yearId || e.yearId === yearId).map((e) => [e.termId, termLabel(e)])).entries()
  );
  const levels = Array.from(new Set(entries.map((e) => e.classLevel))).filter(Boolean);
  const classes = Array.from(
    new Map(
      entries
        .filter((e) => !level || e.classLevel === level)
        .map((e) => [e.classId ?? `copy:${e.copyId}`, classLabel(e) + (e.classId ? "" : " (class removed)")])
    ).entries()
  ).sort((a, b) => a[1].localeCompare(b[1], undefined, { numeric: true }));

  // Pupil search (name or admission number) across the saved copies.
  const needle = q.toLowerCase();
  const pupilMatches = q
    ? filtered.flatMap((e) =>
        (e.pupils ?? [])
          .filter((p) => p.name.toLowerCase().includes(needle) || (p.admission_number ?? "").toLowerCase().includes(needle))
          .map((p) => ({ entry: e, pupil: p }))
      )
    : [];
  const unsearched = q ? filtered.filter((e) => !e.pupils).length : 0;

  // Grouped by term, newest first (entries are already sorted).
  const groups: Array<{ key: string; label: string; items: PublishedEntry[] }> = [];
  for (const e of filtered) {
    const last = groups[groups.length - 1];
    if (last && last.key === e.termId) last.items.push(e);
    else groups.push({ key: e.termId, label: termLabel(e), items: [e] });
  }

  const missingCopies = entries.filter((e) => !e.copyId).length;
  const knownPupils = filtered.reduce((n, e) => n + (e.pupilCount ?? 0), 0);
  const averages = filtered.map((e) => e.finalAverage).filter((v): v is number => v !== null);
  const latest = filtered.reduce<string | null>((m, e) => (!m || e.publishedAt > m ? e.publishedAt : m), null);

  return (
    <div className="space-y-6">
      <UrlToast />
      {header}

      {!archiveReady ? (
        <Alert tone="warning" title="Saved copies are not switched on yet">
          The database update for published results (20261106_published_results_archive.sql) hasn&apos;t been applied, so the results below are
          worked out from today&apos;s records. Please tell whoever looks after the website.
        </Alert>
      ) : isAdmin && missingCopies > 0 ? (
        <Alert
          tone="info"
          title={`${missingCopies} published result${missingCopies === 1 ? " has" : "s have"} no saved copy yet`}
          action={
            <form action={saveMissingCopies}>
              <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                Save copies now
              </SubmitButton>
            </form>
          }
        >
          They were published before copies were kept, so they&apos;re worked out from today&apos;s records: a pupil who has since changed class
          won&apos;t be listed. Saving a copy keeps them as they are today. Results published from now on are saved automatically.
        </Alert>
      ) : null}
      {error ? <Alert tone="danger" title="Some published results couldn't be loaded">{error}</Alert> : null}

      {!entries.length ? (
        <Card>
          <EmptyState
            icon={Archive}
            title={scope.kind === "own" ? "No published results for your classes yet" : "No results have been published yet"}
            description={
              isAdmin
                ? "Results appear here once a class's report cards are published on the Report cards page."
                : "Results appear here once the school publishes a class's report cards."
            }
            action={
              isAdmin ? (
                <ButtonLink href="/admin/academics/reports" size="sm">
                  Go to Report cards
                </ButtonLink>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Class results" value={filtered.length} hint={anyFilter ? `of ${entries.length} published` : "published so far"} icon={Archive} />
            <StatCard label="Pupils" value={knownPupils} hint={filtered.some((e) => e.pupilCount === null) ? "in classes with a saved copy" : "across these results"} icon={Users} tone="blue" />
            <StatCard
              label="Average final score"
              value={averages.length ? `${round2(averages.reduce((a, b) => a + b, 0) / averages.length)}` : "—"}
              hint={averages.length ? "average of the class averages, /100" : "no saved copies to average"}
              tone="gold"
            />
            <StatCard label="Last published" value={latest ? formatLagosDate(latest) : "—"} icon={CalendarDays} tone="slate" />
          </div>

          <Card>
            <CardHeader title="Find results" description="Narrow the list, or search for one pupil by name or admission number." />
            <CardBody>
              <form action={PATH} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-[1fr_1fr_1fr_1fr_1.4fr_auto]">
                <div>
                  <label htmlFor="f-year" className="gf-label">
                    Session
                  </label>
                  <select id="f-year" name="year_id" defaultValue={yearId} className="gf-select">
                    <option value="">All sessions</option>
                    {years.map(([id, name]) => (
                      <option key={id} value={id}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-term" className="gf-label">
                    Term
                  </label>
                  <select id="f-term" name="term_id" defaultValue={termId} className="gf-select">
                    <option value="">All terms</option>
                    {terms.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-level" className="gf-label">
                    Level
                  </label>
                  <select id="f-level" name="level" defaultValue={level} className="gf-select">
                    <option value="">All levels</option>
                    {levels.map((l) => (
                      <option key={l} value={l}>
                        {LEVELS[l] ?? l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="f-class" className="gf-label">
                    Class
                  </label>
                  <select id="f-class" name="class" defaultValue={classKey} className="gf-select">
                    <option value="">All classes</option>
                    {classes.map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2 lg:col-span-3 2xl:col-span-1">
                  <label htmlFor="f-q" className="gf-label">
                    Pupil
                  </label>
                  <input id="f-q" name="q" defaultValue={q} className="gf-input" placeholder="Name or admission no." type="search" />
                </div>
                <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-1">
                  <button type="submit" className={buttonClasses({ variant: "primary", className: "flex-1 sm:flex-none" })}>
                    <Search className="h-4 w-4" aria-hidden="true" />
                    Show
                  </button>
                  {anyFilter ? (
                    <Link href={PATH} className={buttonClasses({ variant: "secondary" })} aria-label="Clear filters">
                      <X className="h-4 w-4" aria-hidden="true" />
                      <span className="sm:hidden lg:inline">Clear</span>
                    </Link>
                  ) : null}
                </div>
              </form>
            </CardBody>
          </Card>

          {q ? (
            <Card>
              <CardHeader
                title={`Pupils matching “${q}”`}
                description={`${pupilMatches.length} result${pupilMatches.length === 1 ? "" : "s"}${
                  unsearched ? ` · ${unsearched} class result${unsearched === 1 ? "" : "s"} without a saved copy can't be searched` : ""
                }`}
              />
              {pupilMatches.length ? (
                <ul className="divide-y divide-slate-100">
                  {pupilMatches.map(({ entry, pupil }) => (
                    <li
                      key={`${entry.copyId}:${pupil.id}`}
                      className="flex flex-col gap-3 px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-slate-900">
                          {pupil.name}
                          {pupil.admission_number ? <span className="ml-2 text-xs font-normal text-slate-500">{pupil.admission_number}</span> : null}
                        </div>
                        <div className="text-sm text-slate-600">
                          {entry.className} · {termLabel(entry)}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="text-sm text-slate-600">
                          {pupil.final !== null ? (
                            <>
                              Final score <span className="font-semibold tabular-nums text-slate-900">{pupil.final}</span>/100
                              {pupil.grade ? ` · ${pupil.grade}` : ""}
                              {pupil.position ? ` · ${ordinal(pupil.position)} in class` : ""}
                            </>
                          ) : (
                            "Final score not ready when published"
                          )}
                        </div>
                        <ButtonLink href={url(`${PATH}/print`, { ...publishedKeyParams(entry), student_id: pupil.id })} variant="secondary" size="sm">
                          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                          Report card
                        </ButtonLink>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Search} title="No pupils found" description="Check the spelling, or clear the other filters to search every published result." />
              )}
            </Card>
          ) : null}

          {groups.length ? (
            groups.map((g) => (
              <Card key={g.key}>
                <CardHeader title={g.label || "Term"} description={`${g.items.length} class${g.items.length === 1 ? "" : "es"} published`} />
                <ul className="divide-y divide-slate-100">
                  {g.items.map((e) => {
                    const key = publishedKeyParams(e);
                    return (
                      <li
                        key={e.copyId ?? `${e.classId}:${e.termId}`}
                        className="flex flex-col gap-3 px-5 py-4 sm:px-6 md:flex-row md:items-center md:justify-between"
                      >
                        <div className="min-w-0">
                          <Link href={url(`${PATH}/view`, key)} className="font-semibold text-slate-900 hover:underline">
                            {e.className}
                          </Link>
                          <span className="ml-2 text-xs text-slate-500">
                            {LEVELS[e.classLevel] ?? e.classLevel}
                            {e.classId ? "" : " · class since removed"}
                          </span>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                            {e.pupilCount !== null ? <span>{e.pupilCount} pupil{e.pupilCount === 1 ? "" : "s"}</span> : null}
                            {e.finalAverage !== null ? (
                              <span>
                                Class average <span className="font-semibold tabular-nums text-slate-900">{e.finalAverage}</span>/100
                              </span>
                            ) : null}
                            <span>Published {formatLagosDate(e.publishedAt)}</span>
                            {e.copyId ? null : <Badge tone="gold">No saved copy yet</Badge>}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap gap-2">
                          <ButtonLink href={url(`${PATH}/view`, key)} size="sm">
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                            View
                          </ButtonLink>
                          <ButtonLink href={url(`${PATH}/print`, key)} variant="secondary" size="sm">
                            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                            Report cards
                          </ButtonLink>
                          <a
                            href={url(`${PATH}/download`, key)}
                            className={buttonClasses({ variant: "secondary", size: "sm" })}
                            aria-label={`Download ${e.className} ${e.termName} results for Excel`}
                          >
                            <Download className="h-3.5 w-3.5" aria-hidden="true" />
                            Excel
                          </a>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            ))
          ) : (
            <Card>
              <EmptyState
                icon={Search}
                title="Nothing matches these filters"
                description="Try another session or term, or clear the filters."
                action={
                  <ButtonLink href={url(PATH, q ? { q } : {})} variant="secondary" size="sm">
                    Clear filters
                  </ButtonLink>
                }
              />
            </Card>
          )}
        </>
      )}
    </div>
  );
}
