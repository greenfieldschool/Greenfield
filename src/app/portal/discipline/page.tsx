import { ShieldCheck } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { formatLagosDate } from "@/lib/lagos-dates";
import { Card } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { PillLinks, PortalPageHeader, PortalNotice, portalMessages } from "../_components/portal-ui";

function severityTone(severity: number): BadgeTone {
  if (severity >= 4) return "red";
  if (severity >= 2) return "gold";
  return "slate";
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

type StudentGuardianRow = { student_id: string };

type StudentRow = { id: string; first_name: string; last_name: string };

type DisciplineRow = {
  id: string;
  category: string | null;
  description: string;
  severity: number;
  occurred_at: string;
  sanction: string | null;
};

export default async function PortalDisciplinePage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  let errorMsg: string | null = null;

  const { data: identityRows, error: identityError } = await withTimeout(
    supabase.rpc("portal_identity"),
    6000
  );
  if (identityError) {
    errorMsg = String(identityError.message ?? "");
  }
  const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : null) as unknown as {
    role?: string | null;
    student_id?: string | null;
    guardian_id?: string | null;
  } | null;

  const role = identity?.role ?? null;
  if (role !== "student" && role !== "parent") return <PortalNotice title="Discipline" message={portalMessages.notPortal} />;

  const sp = (await searchParams) ?? {};
  const selectedStudentIdRaw = sp.student_id;
  const selectedStudentId = Array.isArray(selectedStudentIdRaw)
    ? (selectedStudentIdRaw[0] ?? "")
    : (selectedStudentIdRaw ?? "");

  let studentId: string | null = null;
  let parentStudents: StudentRow[] = [];

  if (role === "student") {
    studentId = identity?.student_id ?? null;
  }

  if (role === "parent") {
    const guardianId = identity?.guardian_id ?? null;
    if (!guardianId) return <PortalNotice title="Discipline" message={portalMessages.noGuardian} />;

    const { data: links } = await supabase
      .from("student_guardians")
      .select("student_id")
      .eq("guardian_id", guardianId);

    const studentIds = (links as StudentGuardianRow[] | null | undefined)
      ?.map((r) => r.student_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0) ?? [];

    if (!studentIds.length) return <PortalNotice title="Discipline" message={portalMessages.noChildren} />;

    const { data: studentsData } = await supabase
      .from("students")
      .select("id, first_name, last_name")
      .in("id", studentIds)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });

    parentStudents = (studentsData ?? []) as StudentRow[];
    const fallbackId = parentStudents[0]?.id ?? studentIds[0] ?? null;
    studentId = selectedStudentId.length ? selectedStudentId : fallbackId;
  }

  if (!studentId)
    return (
      <PortalNotice
        title="Discipline"
        message={role === "parent" ? portalMessages.noChildren : portalMessages.noStudent}
      />
    );

  let rows: DisciplineRow[] = [];
  try {
    const { data, error: disciplineError } = await withTimeout(
      supabase
        .from("welfare_discipline_records")
        .select("id, category, description, severity, occurred_at, sanction")
        .eq("student_id", studentId)
        .order("occurred_at", { ascending: false })
        .limit(50),
      6000
    );
    if (disciplineError && !errorMsg) {
      errorMsg = String(disciplineError.message ?? "");
    }
    rows = (data ?? []) as DisciplineRow[];
  } catch (e) {
    if (!errorMsg) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader title="Discipline" description="Behaviour records shared by the school." />

      {role === "parent" && parentStudents.length > 1 ? (
        <PillLinks
          label="Choose a child"
          items={parentStudents.map((st) => ({
            key: st.id,
            href: `/portal/discipline?student_id=${st.id}`,
            label: `${st.first_name} ${st.last_name}`,
            active: st.id === studentId
          }))}
        />
      ) : null}

      {errorMsg ? (
        <Alert tone="warning" title="Discipline records temporarily unavailable">
          <span className="text-xs">{errorMsg}</span>
        </Alert>
      ) : null}

      {rows.length ? (
        <div className="space-y-4">
          {rows.map((r) => (
            <Card key={r.id} className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-900">{r.category ?? "Discipline"}</div>
                  <div className="mt-0.5 text-sm text-slate-500">{formatLagosDate(r.occurred_at)}</div>
                </div>
                <Badge tone={severityTone(Number(r.severity ?? 0))}>Severity {r.severity}</Badge>
              </div>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{r.description}</p>
              {r.sanction ? (
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
                  <div className="text-xs font-medium text-slate-500">Action taken</div>
                  <div className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{r.sanction}</div>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState icon={ShieldCheck} title="No discipline records" description="Nothing has been recorded. Keep it up!" />
        </Card>
      )}
    </div>
  );
}
