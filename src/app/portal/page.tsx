import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate } from "@/lib/lagos-dates";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { UserX } from "lucide-react";
import PortalDashboardView, { type ParentDashboard, type StudentDashboard } from "./PortalDashboardView";

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

type IdentityRow = { role: string | null; student_id: string | null; guardian_id: string | null };

type ClassRef = { level: string; name: string };

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string | null;
  class_id: string | null;
  classes: ClassRef | ClassRef[] | null;
};

type AttemptRow = {
  id: string;
  obtained_marks: number;
  max_marks: number;
  percent: number;
  exam_test_sessions:
    | { exam_tests: { name: string } | Array<{ name: string }> | null }
    | Array<{ exam_tests: { name: string } | Array<{ name: string }> | null }>
    | null;
};

type OpenSessionRow = { id: string; test_name: string; duration_minutes: number | null; ends_at: string | null };

function classLabel(c: ClassRef | null) {
  return c ? `${c.level.charAt(0).toUpperCase()}${c.level.slice(1)} · ${c.name}` : null;
}

function NotLinked({ email }: { email: string }) {
  return (
    <Card>
      <EmptyState
        icon={UserX}
        title="Your account isn't linked to a student record yet"
        description={`Please contact the school office to finish setting up your portal. Signed in as ${email}.`}
      />
    </Card>
  );
}

export default async function PortalHomePage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  let errorMsg: string | null = null;
  let identity: IdentityRow | null = null;
  try {
    const { data, error } = await withTimeout(supabase.rpc("portal_identity"), 6000);
    if (error) errorMsg = error.message;
    identity = (Array.isArray(data) ? (data[0] ?? null) : data) as IdentityRow | null;
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  const role = identity?.role ?? null;

  if (role === "student") {
    const studentId = identity?.student_id ?? null;
    if (!studentId) return <NotLinked email={user.email ?? ""} />;

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    // Widgets load independently; a failure in one leaves the others intact.
    const [studentRes, sessionsRes, attemptsRes, attendanceRes] = await Promise.all([
      supabase
        .from("students")
        .select("id, first_name, last_name, admission_number, class_id, classes(level, name)")
        .eq("id", studentId)
        .maybeSingle(),
      withTimeout(supabase.rpc("portal_student_exam_sessions"), 8000).catch(() => ({ data: null, error: null })),
      supabase
        .from("exam_attempts")
        .select("id, obtained_marks, max_marks, percent, exam_test_sessions!inner(results_released_at, exam_tests(name))")
        .eq("student_id", studentId)
        .not("exam_test_sessions.results_released_at", "is", null)
        .order("submitted_at", { ascending: false })
        .limit(4),
      supabase.from("student_attendance").select("status").eq("student_id", studentId).gte("date", since)
    ]);

    const student = (studentRes.data ?? null) as unknown as StudentRow | null;
    if (!student) return <NotLinked email={user.email ?? ""} />;

    let termResultsPublished = false;
    if (student.class_id) {
      const { data: pubs } = await supabase
        .from("result_publications")
        .select("id")
        .eq("scope", "term_results")
        .eq("class_id", student.class_id)
        .limit(1);
      termResultsPublished = (pubs ?? []).length > 0;
    }

    const attRows = (attendanceRes.data ?? []) as Array<{ status: string }>;

    const data: StudentDashboard = {
      kind: "student",
      name: `${student.first_name} ${student.last_name}`,
      classLabel: classLabel(firstOrNull(student.classes)),
      admissionNumber: student.admission_number,
      openExams: ((sessionsRes.data ?? []) as OpenSessionRow[]).slice(0, 5).map((s) => ({
        id: s.id,
        name: s.test_name,
        durationLabel: s.duration_minutes ? `${s.duration_minutes} minutes` : "No time limit",
        closesLabel: s.ends_at ? formatLagosDate(s.ends_at) : null
      })),
      recentResults: ((attemptsRes.data ?? []) as unknown as AttemptRow[]).map((a) => ({
        id: a.id,
        name: firstOrNull(firstOrNull(a.exam_test_sessions)?.exam_tests)?.name ?? "Exam",
        score: `${Number(a.obtained_marks ?? 0)} / ${Number(a.max_marks ?? 0)} marks`,
        percent: Number(a.percent ?? 0)
      })),
      termResultsPublished,
      attendance: attRows.length
        ? {
            present: attRows.filter((r) => r.status === "present").length,
            late: attRows.filter((r) => r.status === "late").length,
            absent: attRows.filter((r) => r.status === "absent").length
          }
        : null
    };

    return <PortalDashboardView data={{ ...data, errorMsg }} />;
  }

  if (role === "parent") {
    const guardianId = identity?.guardian_id ?? null;
    if (!guardianId) return <NotLinked email={user.email ?? ""} />;

    const [guardianRes, linksRes, invoicesRes] = await Promise.all([
      supabase.from("guardians").select("full_name").eq("id", guardianId).maybeSingle(),
      supabase.from("student_guardians").select("student_id").eq("guardian_id", guardianId),
      supabase.from("finance_invoice_balances").select("balance, status").eq("bill_to_guardian_id", guardianId)
    ]);

    const studentIds = ((linksRes.data ?? []) as Array<{ student_id: string }>).map((l) => l.student_id);
    const { data: kids } = studentIds.length
      ? await supabase
          .from("students")
          .select("id, first_name, last_name, admission_number, class_id, classes(level, name)")
          .in("id", studentIds)
          .order("first_name")
      : { data: [] };

    const invoices = ((invoicesRes.data ?? []) as Array<{ balance: number; status: string }>).filter((i) => i.status !== "void");
    const unpaid = invoices.filter((i) => Number(i.balance ?? 0) > 0);

    const data: ParentDashboard = {
      kind: "parent",
      name: (guardianRes.data as { full_name?: string } | null)?.full_name ?? (user.email ?? "").split("@")[0],
      children: ((kids ?? []) as unknown as StudentRow[]).map((k) => ({
        id: k.id,
        name: `${k.first_name} ${k.last_name}`,
        classLabel: classLabel(firstOrNull(k.classes)),
        admissionNumber: k.admission_number
      })),
      billing: invoicesRes.error
        ? null
        : {
            outstanding: unpaid.reduce((acc, i) => acc + Number(i.balance ?? 0), 0),
            unpaidInvoices: unpaid.length
          }
    };

    return <PortalDashboardView data={{ ...data, errorMsg }} />;
  }

  return (
    <Card>
      <EmptyState
        icon={UserX}
        title="Portal temporarily unavailable"
        description={errorMsg ?? "We couldn't confirm your account type. Please sign out and sign in again."}
      />
    </Card>
  );
}
