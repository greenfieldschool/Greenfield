import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ProfileRow = { role: string };
type StudentLinkRow = { student_id: string };
type GuardianLinkRow = { guardian_id: string };
type StudentGuardianRow = { student_id: string };

type StudentRow = { id: string; first_name: string; last_name: string };

type IncidentRow = {
  id: string;
  incident_type: string;
  description: string;
  severity: number;
  resolved: boolean;
  occurred_at: string;
};

export default async function PortalIncidentsPage({
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

  const { data: profileData } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = ((profileData ?? null) as ProfileRow | null)?.role ?? null;
  if (role !== "student" && role !== "parent") return null;

  const sp = (await searchParams) ?? {};
  const selectedStudentIdRaw = sp.student_id;
  const selectedStudentId = Array.isArray(selectedStudentIdRaw)
    ? (selectedStudentIdRaw[0] ?? "")
    : (selectedStudentIdRaw ?? "");

  let studentId: string | null = null;
  let parentStudents: StudentRow[] = [];

  if (role === "student") {
    const { data: studentLink } = await supabase
      .from("student_user_links")
      .select("student_id")
      .eq("user_id", user.id)
      .maybeSingle();

    studentId = (studentLink as StudentLinkRow | null)?.student_id ?? null;
  }

  if (role === "parent") {
    const { data: guardianLink } = await supabase
      .from("guardian_user_links")
      .select("guardian_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const guardianId = (guardianLink as GuardianLinkRow | null)?.guardian_id ?? null;
    if (!guardianId) return null;

    const { data: links } = await supabase
      .from("student_guardians")
      .select("student_id")
      .eq("guardian_id", guardianId);

    const studentIds = (links as StudentGuardianRow[] | null | undefined)
      ?.map((r) => r.student_id)
      .filter((v): v is string => typeof v === "string" && v.length > 0) ?? [];

    if (!studentIds.length) return null;

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

  if (!studentId) return null;

  const { data } = await supabase
    .from("welfare_incidents")
    .select("id, incident_type, description, severity, resolved, occurred_at")
    .eq("student_id", studentId)
    .order("occurred_at", { ascending: false })
    .limit(50);

  const rows = (data ?? []) as IncidentRow[];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Incidents / Health</h1>
        {role === "parent" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {parentStudents.map((st) => {
              const active = st.id === studentId;
              return (
                <Link
                  key={st.id}
                  href={`/portal/incidents?student_id=${st.id}`}
                  className={
                    "rounded-xl border px-3 py-1.5 text-xs font-semibold transition " +
                    (active
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
                  }
                >
                  {st.first_name} {st.last_name}
                </Link>
              );
            })}
          </div>
        ) : null}
        <p className="mt-2 text-sm text-slate-600">Recent incident and health records.</p>
      </div>

      <div className="space-y-4">
        {rows.length ? (
          rows.map((r) => (
            <div key={r.id} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{r.incident_type}</div>
                  <div className="mt-1 text-xs font-semibold text-slate-500">{String(r.occurred_at).slice(0, 10)}</div>
                </div>
                <div className="text-xs font-semibold text-slate-700">
                  Severity: {r.severity} • {r.resolved ? "Resolved" : "Open"}
                </div>
              </div>
              <div className="mt-4 whitespace-pre-wrap text-sm text-slate-700">{r.description}</div>
            </div>
          ))
        ) : (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
            No incidents recorded yet.
          </div>
        )}
      </div>
    </div>
  );
}
