import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { buildClassReport, type ClassReport } from "@/lib/term-report";
import { round2 } from "@/lib/results";
import { getTeacherAccess, type TeacherAccess } from "@/lib/teacher-access";

// Published results archive (migration 20261106). When a class's term results are published, the server keeps a
// copy of the class report in published_results, so the Published results page shows exactly what was published,
// even after pupils move up a class. Results published before the archive existed have no copy yet: they are
// worked out from today's records until an admin saves copies.

// The table isn't there until 20261106_published_results_archive.sql has been run.
const ARCHIVE_MISSING = /published_results|does not exist|schema cache/i;

export type PublishedPupil = {
  id: string;
  name: string;
  admission_number: string | null;
  final: number | null;
  grade: string | null;
  position: number | null;
};

/** One published class + term on the list: a saved copy, or a publication that has no copy yet. */
export type PublishedEntry = {
  /** The saved copy's id, or null when there is no copy yet. */
  copyId: string | null;
  classId: string | null;
  className: string;
  classLevel: string;
  termId: string;
  termName: string;
  yearId: string | null;
  yearName: string | null;
  publishedAt: string;
  /** Null when there is no saved copy yet. */
  savedAt: string | null;
  pupils: PublishedPupil[] | null;
  pupilCount: number | null;
  finalAverage: number | null;
};

/** Who may open Published results: admins and front desk see every class, class teachers their own classes. */
export type PublishedScope = { kind: "all" } | { kind: "own"; classIds: string[] } | { kind: "none" };

export function publishedScope(role: string | null | undefined, access: TeacherAccess): PublishedScope {
  if (role === "admin" || role === "super_admin" || role === "front_desk") return { kind: "all" };
  if (role === "teacher") return { kind: "own", classIds: access.classTeacherClassIds };
  return { kind: "none" };
}

/** The signed-in person's role and what they may see on Published results. */
export async function publishedViewer(supabase: SupabaseClient) {
  const access = await getTeacherAccess(supabase as Parameters<typeof getTeacherAccess>[0]);
  const { data } = access.userId ? await supabase.from("profiles").select("role").eq("id", access.userId).maybeSingle() : { data: null };
  const role = (data as { role?: string } | null)?.role ?? null;
  return { access, role, isAdmin: role === "admin" || role === "super_admin", scope: publishedScope(role, access) };
}

export function scopeAllows(scope: PublishedScope, classId: string | null) {
  if (scope.kind === "all") return true;
  if (scope.kind === "own") return Boolean(classId && scope.classIds.includes(classId));
  return false;
}

export function pupilSummary(report: ClassReport): PublishedPupil[] {
  return report.students.map((r) => ({
    id: r.student.id,
    name: [r.student.last_name, r.student.first_name, r.student.middle_name].filter(Boolean).join(" "),
    admission_number: r.student.admission_number,
    final: r.termTotal,
    grade: r.termGrade,
    position: r.position
  }));
}

export function finalAverage(report: ClassReport) {
  const totals = report.students.map((r) => r.termTotal).filter((t): t is number => t !== null);
  return totals.length ? round2(totals.reduce((a, b) => a + b, 0) / totals.length) : null;
}

/**
 * Saves (or replaces) the copy of a published class + term. Runs on the server with the service key, after the
 * caller has published; it checks the publication itself, so it can never archive unpublished results.
 */
export async function archivePublishedResults(classId: string, termId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const service = getSupabaseServiceClient() as SupabaseClient | null;
  if (!service) return { ok: false, reason: "The school's service key is not set on the server." };

  const { data: pub, error: pubError } = await service
    .from("result_publications")
    .select("id, published_at, published_by")
    .eq("scope", "term_results")
    .eq("class_id", classId)
    .eq("academic_term_id", termId)
    .maybeSingle();
  if (pubError) return { ok: false, reason: pubError.message };
  if (!pub) return { ok: false, reason: "These results are not published." };

  const report = await buildClassReport(service, classId, termId);
  if (!report) return { ok: false, reason: "The class or term could not be found." };

  const p = pub as { id: string; published_at: string; published_by: string | null };
  const { error } = await service.from("published_results").upsert(
    {
      class_id: classId,
      class_name: report.cls.name,
      class_level: report.cls.level,
      academic_term_id: termId,
      academic_year_id: report.year?.id ?? null,
      term_name: report.term.name,
      year_name: report.year?.name ?? null,
      publication_id: p.id,
      published_at: p.published_at,
      published_by: p.published_by,
      report,
      pupils: pupilSummary(report),
      pupil_count: report.students.length,
      final_average: finalAverage(report),
      saved_at: new Date().toISOString()
    },
    { onConflict: "class_id,academic_term_id" }
  );
  return error ? { ok: false, reason: error.message } : { ok: true };
}

type ArchiveRow = {
  id: string;
  class_id: string | null;
  class_name: string;
  class_level: string;
  academic_term_id: string;
  academic_year_id: string | null;
  term_name: string;
  year_name: string | null;
  published_at: string;
  saved_at: string;
  pupils: PublishedPupil[];
  pupil_count: number;
  final_average: number | null;
};

type PublicationRow = {
  class_id: string | null;
  academic_term_id: string | null;
  academic_year_id: string | null;
  published_at: string;
  classes: { name: string; level: string } | Array<{ name: string; level: string }> | null;
  academic_terms: { name: string; starts_on: string | null } | Array<{ name: string; starts_on: string | null }> | null;
  academic_years: { name: string } | Array<{ name: string }> | null;
};

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v);

/**
 * Every published class + term the person may see, newest term first. Copies come from the archive (read with the
 * person's own login, so the database's rules decide); publications without a copy are added from
 * result_publications. `archiveReady` is false until the migration has been run.
 */
export async function loadPublishedEntries(supabase: SupabaseClient, scope: PublishedScope) {
  if (scope.kind === "none") return { entries: [] as PublishedEntry[], archiveReady: true, error: null as string | null };

  const [{ data: archiveData, error: archiveError }, { data: pubData, error: pubError }] = await Promise.all([
    supabase
      .from("published_results")
      .select(
        "id, class_id, class_name, class_level, academic_term_id, academic_year_id, term_name, year_name, published_at, saved_at, pupils, pupil_count, final_average"
      )
      .not("publication_id", "is", null),
    supabase
      .from("result_publications")
      .select("class_id, academic_term_id, academic_year_id, published_at, classes(name, level), academic_terms(name, starts_on), academic_years(name)")
      .eq("scope", "term_results")
  ]);

  const archiveReady = !(archiveError && ARCHIVE_MISSING.test(archiveError.message));
  const error = pubError?.message ?? (archiveReady ? archiveError?.message ?? null : null);

  const termStart = new Map<string, string>();
  const entries = new Map<string, PublishedEntry>();
  for (const p of (pubData ?? []) as unknown as PublicationRow[]) {
    if (!p.class_id || !p.academic_term_id || !scopeAllows(scope, p.class_id)) continue;
    const cls = one(p.classes);
    const term = one(p.academic_terms);
    if (term?.starts_on) termStart.set(p.academic_term_id, term.starts_on);
    entries.set(`${p.class_id}:${p.academic_term_id}`, {
      copyId: null,
      classId: p.class_id,
      className: cls?.name ?? "Class",
      classLevel: cls?.level ?? "",
      termId: p.academic_term_id,
      termName: term?.name ?? "Term",
      yearId: p.academic_year_id,
      yearName: one(p.academic_years)?.name ?? null,
      publishedAt: p.published_at,
      savedAt: null,
      pupils: null,
      pupilCount: null,
      finalAverage: null
    });
  }
  // A saved copy is shown only while its class + term is still published (it is on the list above), or when its
  // class has since been deleted or merged (then only the copy is left).
  for (const a of (archiveData ?? []) as unknown as ArchiveRow[]) {
    const key = `${a.class_id}:${a.academic_term_id}`;
    if (a.class_id && !entries.has(key)) continue;
    entries.set(key, {
      copyId: a.id,
      classId: a.class_id,
      className: a.class_name,
      classLevel: a.class_level,
      termId: a.academic_term_id,
      termName: a.term_name,
      yearId: a.academic_year_id,
      yearName: a.year_name,
      publishedAt: a.published_at,
      savedAt: a.saved_at,
      pupils: a.pupils ?? [],
      pupilCount: a.pupil_count,
      finalAverage: a.final_average === null ? null : Number(a.final_average)
    });
  }

  const list = Array.from(entries.values()).sort(
    (x, y) =>
      (termStart.get(y.termId) ?? y.publishedAt).localeCompare(termStart.get(x.termId) ?? x.publishedAt) ||
      x.classLevel.localeCompare(y.classLevel) ||
      x.className.localeCompare(y.className, undefined, { numeric: true })
  );
  return { entries: list, archiveReady, error };
}

/** How a page names one published class + term: its saved copy, or (no copy yet) the class and term. */
export type PublishedKey = { copyId: string } | { classId: string; termId: string };

export function publishedKeyParams(e: Pick<PublishedEntry, "copyId" | "classId" | "termId">): Record<string, string> {
  return e.copyId ? { copy: e.copyId } : { class_id: e.classId ?? "", term_id: e.termId };
}

export function readPublishedKey(sp: Record<string, string | string[] | undefined>): PublishedKey | null {
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined))?.trim() ?? "";
  if (get("copy")) return { copyId: get("copy") };
  if (get("class_id") && get("term_id")) return { classId: get("class_id"), termId: get("term_id") };
  return null;
}


/**
 * One published class + term: the saved copy, or (no copy yet) the report worked out now. The copy is read with
 * the person's own login, so the database decides who sees it. The fallback reads with the service key, like the
 * portal, because front desk can't read every welfare record directly: check scopeAllows(scope, classId) first.
 */
export async function loadPublishedReport(
  supabase: SupabaseClient,
  key: PublishedKey,
  scope: PublishedScope
): Promise<
  | { kind: "ok"; report: ClassReport; source: "archive" | "live"; savedAt: string | null; publishedAt: string; params: Record<string, string> }
  | { kind: "not-found" }
  | { kind: "error"; message: string }
> {
  type Saved = { id: string; class_id: string | null; report: ClassReport; saved_at: string; published_at: string; publication_id: string | null };
  const columns = "id, class_id, report, saved_at, published_at, publication_id";
  const { data, error } =
    "copyId" in key
      ? await supabase.from("published_results").select(columns).eq("id", key.copyId).maybeSingle()
      : await supabase.from("published_results").select(columns).eq("class_id", key.classId).eq("academic_term_id", key.termId).maybeSingle();
  if (error && !ARCHIVE_MISSING.test(error.message)) return { kind: "error", message: error.message };
  const row = data as Saved | null;
  // A copy counts while its results are published, or when only the copy is left (class deleted or merged).
  if (row && (row.publication_id || !row.class_id) && scopeAllows(scope, row.class_id)) {
    return { kind: "ok", report: row.report, source: "archive", savedAt: row.saved_at, publishedAt: row.published_at, params: { copy: row.id } };
  }
  if ("copyId" in key) return { kind: "not-found" };
  if (!scopeAllows(scope, key.classId)) return { kind: "not-found" };

  const { data: pub } = await supabase
    .from("result_publications")
    .select("published_at")
    .eq("scope", "term_results")
    .eq("class_id", key.classId)
    .eq("academic_term_id", key.termId)
    .maybeSingle();
  if (!pub) return { kind: "not-found" };

  const client = (getSupabaseServiceClient() as SupabaseClient | null) ?? supabase;
  const report = await buildClassReport(client, key.classId, key.termId);
  if (!report) return { kind: "not-found" };
  return {
    kind: "ok",
    report,
    source: "live",
    savedAt: null,
    publishedAt: (pub as { published_at: string }).published_at,
    params: { class_id: key.classId, term_id: key.termId }
  };
}
