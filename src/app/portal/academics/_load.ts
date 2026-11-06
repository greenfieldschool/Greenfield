import type { SupabaseClient } from "@supabase/supabase-js";
import type { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { buildClassReport, type ClassReport, type StudentReport } from "@/lib/term-report";
import { reportFeeHold, type FeeHold } from "@/lib/fee-hold";
import { portalMessages } from "../_components/portal-ui";

// Everything the portal report card and certificates pages need: who is looking, which child and term, the
// published report, and whether it is held back for unpaid fees. Both pages use this so they can't disagree.
//
// Terms come from two places:
//   * the published results archive (published_results): a copy of each class + term saved when it was published.
//     Every copy the pupil is in is listed, whatever class they are in now, so last year's report cards stay after
//     the pupil moves up. Parents and pupils can't read the archive themselves (its rules only let staff in), so it
//     is read with the service key, only for a child the parent is linked to, matched on the pupil id in `pupils`.
//   * publications of the pupil's current class that have no copy yet (published before the archive existed):
//     those are worked out live, as before.
// The full class report never leaves the server: the report card and certificates are server components that show
// only this pupil's results plus class averages, highest scores, class size and position.

type Supabase = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

type IdentityRow = { role: string | null; student_id: string | null; guardian_id: string | null };

/** One published term the pupil can open. */
export type ReportTerm = {
  /** Unique within the list, and used in the link (`copy=` or `pub=`). */
  key: string;
  source: "archive" | "live";
  /** The saved copy's id (archive only). */
  copyId: string | null;
  /** The publication's id: always set for live terms; null on a copy whose results are no longer published. */
  pubId: string | null;
  classId: string | null;
  className: string | null;
  termId: string;
  termName: string;
  yearName: string | null;
  publishedAt: string;
  /** For ordering, newest first. */
  termStartsOn: string | null;
};

export type PortalReport =
  | { kind: "notice"; message: string }
  | { kind: "empty"; message: string }
  | {
      kind: "ok";
      role: "parent" | "student";
      student: { id: string; first_name: string; last_name: string };
      parentStudents: Array<{ id: string; first_name: string; last_name: string }>;
      terms: ReportTerm[];
      latest: ReportTerm;
      report: ClassReport;
      mine: StudentReport;
      /** Positions need the whole class: true for saved copies, and for live reports read with the service key. */
      canRank: boolean;
      hold: FeeHold;
    };

export function firstOrNull<T>(v: T | T[] | null | undefined) {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

type PubRow = {
  id: string;
  class_id: string | null;
  academic_term_id: string | null;
  published_at: string;
  classes: { name: string } | Array<{ name: string }> | null;
  academic_years: { name: string } | Array<{ name: string }> | null;
  academic_terms: { name: string; starts_on: string | null } | Array<{ name: string; starts_on: string | null }> | null;
};

type CopyRow = {
  id: string;
  class_id: string | null;
  class_name: string;
  academic_term_id: string;
  term_name: string;
  year_name: string | null;
  publication_id: string | null;
  published_at: string;
};

/** The link that opens a term: `copy=` for a saved copy, `pub=` for a live publication. */
export function termParams(t: ReportTerm, studentId: string | null): URLSearchParams {
  const params = new URLSearchParams(t.copyId ? { copy: t.copyId } : { pub: t.pubId ?? "" });
  if (studentId) params.set("student_id", studentId);
  return params;
}

// jsonb containment: a pupils list with an entry for this pupil. It must be a JSON string: given an array,
// supabase-js writes a Postgres array literal ({...}), which a jsonb column rejects.
const pupilFilter = (studentId: string) => JSON.stringify([{ id: studentId }]);

/**
 * Saved copies the pupil is in, read with the service key. The caller must already have checked that the person may
 * see this pupil. A copy counts while its results are published, or when its class was deleted or merged (then only
 * the copy is left), the same rule as the staff Published results page.
 */
async function archivedTerms(service: SupabaseClient, studentId: string): Promise<CopyRow[]> {
  const { data, error } = await service
    .from("published_results")
    .select("id, class_id, class_name, academic_term_id, term_name, year_name, publication_id, published_at")
    .contains("pupils", pupilFilter(studentId))
    .or("publication_id.not.is.null,class_id.is.null");
  // Before 20261106 is run the table isn't there; any other failure falls back to the live reports, as before.
  if (error) return [];
  return (data ?? []) as CopyRow[];
}

export async function loadPortalReport(
  supabase: Supabase,
  sp: Record<string, string | string[] | undefined>
): Promise<PortalReport | null> {
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: identityRows } = await supabase.rpc("portal_identity");
  const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : null) as unknown as IdentityRow | null;
  const role = identity?.role ?? null;
  if (role !== "student" && role !== "parent") return { kind: "notice", message: portalMessages.notPortal };

  const pick = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const selectedStudentId = pick(sp.student_id);

  let studentId: string | null = null;
  let parentStudents: Array<{ id: string; first_name: string; last_name: string }> = [];

  if (role === "student") {
    studentId = identity?.student_id ?? null;
  } else {
    const guardianId = identity?.guardian_id ?? null;
    if (!guardianId) return { kind: "empty", message: portalMessages.noGuardian };

    const { data: links } = await supabase.from("student_guardians").select("student_id").eq("guardian_id", guardianId);
    const studentIds = ((links ?? []) as Array<{ student_id: string }>).map((r) => r.student_id).filter(Boolean);
    if (!studentIds.length) return { kind: "empty", message: portalMessages.noChildren };

    const { data: studentsData } = await supabase
      .from("students")
      .select("id, first_name, last_name")
      .in("id", studentIds)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });
    parentStudents = (studentsData ?? []) as Array<{ id: string; first_name: string; last_name: string }>;

    // Only the parent's own children: everything below is read with the school's service key.
    studentId = studentIds.includes(selectedStudentId) ? selectedStudentId : (parentStudents[0]?.id ?? studentIds[0] ?? null);
  }

  if (!studentId) return { kind: "notice", message: role === "parent" ? portalMessages.noChildren : portalMessages.noStudent };

  // Read with the person's own login: a parent only gets a row for their own child, a pupil only their own.
  const { data: studentData } = await supabase.from("students").select("id, first_name, last_name, class_id").eq("id", studentId).maybeSingle();
  const student = studentData as { id: string; first_name: string; last_name: string; class_id: string | null } | null;
  if (!student) return { kind: "empty", message: "This pupil's record couldn't be found — please contact the school office." };
  const classId = student.class_id;

  // Class averages, highest scores and positions need the whole class, which parents can't read directly, so
  // reports are read with the service key. Without it, only the current class's reports, from the pupil's own records.
  const service = getSupabaseServiceClient() as SupabaseClient | null;
  const client = service ?? (supabase as SupabaseClient);

  const [copies, pubsResult] = await Promise.all([
    service ? archivedTerms(service, student.id) : Promise.resolve([] as CopyRow[]),
    classId
      ? supabase
          .from("result_publications")
          .select("id, class_id, academic_term_id, published_at, classes(name), academic_years(name), academic_terms(name, starts_on)")
          .eq("scope", "term_results")
          .eq("class_id", classId)
          .order("published_at", { ascending: false })
      : Promise.resolve({ data: [] as PubRow[] })
  ]);
  const pubs = ((pubsResult.data ?? []) as unknown as PubRow[]).filter((p) => p.academic_term_id);

  // A current-class publication with a saved copy is shown from the copy. If the pupil isn't in that copy (they
  // joined the class after it was published), the term isn't theirs to see.
  let copiedCurrent = new Set<string>();
  if (service && classId && pubs.length) {
    const { data } = await service
      .from("published_results")
      .select("academic_term_id")
      .eq("class_id", classId)
      .in(
        "academic_term_id",
        pubs.map((p) => p.academic_term_id as string)
      );
    copiedCurrent = new Set(((data ?? []) as Array<{ academic_term_id: string }>).map((r) => r.academic_term_id));
  }

  // Term start dates, to put the terms in order (copies keep only the term's name).
  const startsById = new Map<string, string | null>();
  for (const p of pubs) startsById.set(p.academic_term_id as string, firstOrNull(p.academic_terms)?.starts_on ?? null);
  const missingStarts = Array.from(new Set(copies.map((c) => c.academic_term_id).filter((id) => !startsById.has(id))));
  if (missingStarts.length) {
    const { data } = await client.from("academic_terms").select("id, starts_on").in("id", missingStarts);
    for (const t of (data ?? []) as Array<{ id: string; starts_on: string | null }>) startsById.set(t.id, t.starts_on);
  }

  const terms: ReportTerm[] = [
    ...copies.map(
      (c): ReportTerm => ({
        key: `copy:${c.id}`,
        source: "archive",
        copyId: c.id,
        pubId: c.publication_id,
        classId: c.class_id,
        className: c.class_name,
        termId: c.academic_term_id,
        termName: c.term_name,
        yearName: c.year_name,
        publishedAt: c.published_at,
        termStartsOn: startsById.get(c.academic_term_id) ?? null
      })
    ),
    ...pubs
      .filter((p) => !copiedCurrent.has(p.academic_term_id as string))
      .map(
        (p): ReportTerm => ({
          key: `pub:${p.id}`,
          source: "live",
          copyId: null,
          pubId: p.id,
          classId: p.class_id,
          className: firstOrNull(p.classes)?.name ?? null,
          termId: p.academic_term_id as string,
          termName: firstOrNull(p.academic_terms)?.name ?? "Term",
          yearName: firstOrNull(p.academic_years)?.name ?? null,
          publishedAt: p.published_at,
          termStartsOn: startsById.get(p.academic_term_id as string) ?? null
        })
      )
  ].sort((a, b) => (b.termStartsOn ?? b.publishedAt).localeCompare(a.termStartsOn ?? a.publishedAt) || b.publishedAt.localeCompare(a.publishedAt));

  // Old links name a publication (`pub=`); that still opens its saved copy.
  const wantCopy = pick(sp.copy);
  const wantPub = pick(sp.pub);
  const latest =
    (wantCopy && terms.find((t) => t.copyId === wantCopy)) || (wantPub && terms.find((t) => t.pubId === wantPub)) || terms[0] || null;

  if (!latest) {
    return {
      kind: "empty",
      message: classId
        ? "No term results have been published for this class yet. You'll see the report card here as soon as the school releases it."
        : "Not assigned to a class yet — please contact the school office."
    };
  }

  let report: ClassReport | null = null;
  if (latest.source === "archive" && service) {
    // Checked again here: the copy must still have this pupil in it.
    const { data } = await service
      .from("published_results")
      .select("report")
      .eq("id", latest.copyId as string)
      .contains("pupils", pupilFilter(student.id))
      .maybeSingle();
    report = ((data as { report: ClassReport } | null)?.report ?? null) as ClassReport | null;
  } else if (latest.classId) {
    report = await buildClassReport(client, latest.classId, latest.termId);
  }
  const mine = report?.students.find((r) => r.student.id === student.id) ?? null;
  if (!report || !mine) return { kind: "empty", message: "This report card isn't available yet — please contact the school office." };

  // Fees are checked per term, with the service key, so an invoice billed to the other parent still counts.
  const hold = await reportFeeHold(client, student.id, report.term);

  return {
    kind: "ok",
    role,
    student: { id: student.id, first_name: student.first_name, last_name: student.last_name },
    parentStudents,
    terms,
    latest,
    report,
    mine,
    canRank: latest.source === "archive" || Boolean(service),
    hold
  };
}
