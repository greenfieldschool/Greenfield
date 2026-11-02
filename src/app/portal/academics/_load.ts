import type { SupabaseClient } from "@supabase/supabase-js";
import type { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { buildClassReport, type ClassReport, type StudentReport } from "@/lib/term-report";
import { reportFeeHold, type FeeHold } from "@/lib/fee-hold";
import { portalMessages } from "../_components/portal-ui";

// Everything the portal report card and certificates pages need: who is looking, which child and term, the
// published report, and whether it is held back for unpaid fees. Both pages use this so they can't disagree.

type Supabase = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

type IdentityRow = { role: string | null; student_id: string | null; guardian_id: string | null };

export type PubRow = {
  id: string;
  academic_term_id: string | null;
  published_at: string;
  academic_years: { name: string } | Array<{ name: string }> | null;
  academic_terms: { name: string } | Array<{ name: string }> | null;
};

export type PortalReport =
  | { kind: "notice"; message: string }
  | { kind: "empty"; message: string }
  | {
      kind: "ok";
      role: "parent" | "student";
      student: { id: string; first_name: string; last_name: string };
      parentStudents: Array<{ id: string; first_name: string; last_name: string }>;
      pubs: PubRow[];
      latest: PubRow;
      report: ClassReport;
      mine: StudentReport;
      /** Positions need the whole class, which only the service key can read. */
      canRank: boolean;
      hold: FeeHold;
    };

export function firstOrNull<T>(v: T | T[] | null | undefined) {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
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

    // Only the parent's own children: the report below is read with the school's service key.
    studentId = studentIds.includes(selectedStudentId) ? selectedStudentId : (parentStudents[0]?.id ?? studentIds[0] ?? null);
  }

  if (!studentId) return { kind: "notice", message: role === "parent" ? portalMessages.noChildren : portalMessages.noStudent };

  const { data: studentData } = await supabase.from("students").select("id, first_name, last_name, class_id").eq("id", studentId).maybeSingle();
  const student = studentData as { id: string; first_name: string; last_name: string; class_id: string | null } | null;
  const classId = student?.class_id ?? null;
  if (!student || !classId) return { kind: "empty", message: "Not assigned to a class yet — please contact the school office." };

  const { data: pubsData } = await supabase
    .from("result_publications")
    .select("id, academic_term_id, published_at, academic_years(name), academic_terms(name)")
    .eq("scope", "term_results")
    .eq("class_id", classId)
    .order("published_at", { ascending: false })
    .limit(6);
  const pubs = ((pubsData ?? []) as unknown as PubRow[]).filter((p) => p.academic_term_id);
  const latest = pubs.find((p) => p.id === pick(sp.pub)) ?? pubs[0] ?? null;

  if (!latest?.academic_term_id) {
    return {
      kind: "empty",
      message: "No term results have been published for this class yet. You'll see the report card here as soon as the school releases it."
    };
  }

  // Class averages, highest scores and positions need the whole class, which parents can't read directly, so the
  // published report is built with the service key. Without it, the report is built from the pupil's own records.
  const service = getSupabaseServiceClient();
  const client = (service ?? supabase) as SupabaseClient;
  const report = await buildClassReport(client, classId, latest.academic_term_id);
  const mine = report?.students.find((r) => r.student.id === studentId) ?? null;
  if (!report || !mine) return { kind: "empty", message: "This report card isn't available yet — please contact the school office." };

  // Fees are checked with the service key too, so an invoice billed to the other parent still counts.
  const hold = await reportFeeHold(client, student.id, report.term);

  return {
    kind: "ok",
    role,
    student: { id: student.id, first_name: student.first_name, last_name: student.last_name },
    parentStudents,
    pubs,
    latest,
    report,
    mine,
    canRank: Boolean(service),
    hold
  };
}
