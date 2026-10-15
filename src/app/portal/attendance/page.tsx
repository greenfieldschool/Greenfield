import { CalendarCheck, CalendarX, Clock } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard } from "@/components/ui/stat-card";
import { PillLinks, PortalPageHeader, statusBadge, PortalNotice, portalMessages } from "../_components/portal-ui";

function formatDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

type StudentGuardianRow = { student_id: string };

type StudentRow = { id: string; first_name: string; last_name: string };

type AttendanceRow = { id: string; date: string; status: string };

export default async function PortalAttendancePage({
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
  if (role !== "student" && role !== "parent") return <PortalNotice title="Attendance" message={portalMessages.notPortal} />;

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
    if (!guardianId) return <PortalNotice title="Attendance" message={portalMessages.noGuardian} />;

    const { data: links } = await supabase
      .from("student_guardians")
      .select("student_id")
      .eq("guardian_id", guardianId);

    const studentIds = (links as StudentGuardianRow[] | null | undefined)
      ?.map((r) => r.student_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0) ?? [];

    if (!studentIds.length) return <PortalNotice title="Attendance" message={portalMessages.noChildren} />;

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
        title="Attendance"
        message={role === "parent" ? portalMessages.noChildren : portalMessages.noStudent}
      />
    );

  let rows: AttendanceRow[] = [];
  try {
    const { data, error: attendanceError } = await withTimeout(
      supabase
        .from("student_attendance")
        .select("id, date, status")
        .eq("student_id", studentId)
        .order("date", { ascending: false })
        .limit(60),
      6000
    );
    if (attendanceError && !errorMsg) {
      errorMsg = String(attendanceError.message ?? "");
    }
    rows = (data ?? []) as AttendanceRow[];
  } catch (e) {
    if (!errorMsg) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  const count = (status: string) => rows.filter((r) => String(r.status).toLowerCase() === status).length;
  const presentCount = count("present");
  const lateCount = count("late");
  const absentCount = count("absent");

  return (
    <div className="space-y-6">
      <PortalPageHeader title="Attendance" description="The most recent school days recorded by class teachers." />

      {role === "parent" && parentStudents.length > 1 ? (
        <PillLinks
          label="Choose a child"
          items={parentStudents.map((st) => ({
            key: st.id,
            href: `/portal/attendance?student_id=${st.id}`,
            label: `${st.first_name} ${st.last_name}`,
            active: st.id === studentId
          }))}
        />
      ) : null}

      {errorMsg ? (
        <Alert tone="warning" title="Attendance temporarily unavailable">
          <span className="text-xs">{errorMsg}</span>
        </Alert>
      ) : null}

      {rows.length ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard label="Present" value={presentCount} hint={`of the last ${rows.length} days`} icon={CalendarCheck} tone="green" />
          <StatCard label="Late" value={lateCount} icon={Clock} tone="gold" />
          <StatCard label="Absent" value={absentCount} icon={CalendarX} tone="rose" />
        </div>
      ) : null}

      <Card>
        <CardHeader title="Daily record" />
        {rows.length ? (
          <ul className="divide-y divide-slate-100">
            {rows.map((r) => {
              const badge = statusBadge(r.status);
              return (
                <li key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5 sm:px-6">
                  <span className="text-sm font-medium text-slate-900">{formatDay(r.date)}</span>
                  <Badge tone={badge.tone} dot>
                    {badge.label}
                  </Badge>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarCheck}
            title="No attendance recorded yet"
            description="Attendance appears here once the class teacher marks the register."
          />
        )}
      </Card>
    </div>
  );
}
