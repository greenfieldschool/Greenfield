import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type ProfileRow = { role: string };
type StudentLinkRow = { student_id: string };
type GuardianLinkRow = { guardian_id: string };
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
    .from("student_attendance")
    .select("id, date, status")
    .eq("student_id", studentId)
    .order("date", { ascending: false })
    .limit(60);

  const rows = (data ?? []) as AttendanceRow[];

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Attendance</h1>
        {role === "parent" ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {parentStudents.map((st) => {
              const active = st.id === studentId;
              return (
                <Link
                  key={st.id}
                  href={`/portal/attendance?student_id=${st.id}`}
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
        <p className="mt-2 text-sm text-slate-600">Recent attendance records.</p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-4">Date</div>
          <div className="col-span-8">Status</div>
        </div>
        <div>
          {rows.length ? (
            rows.map((r) => (
              <div key={r.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                <div className="col-span-4 font-semibold text-slate-900">{r.date}</div>
                <div className="col-span-8 text-slate-700">{r.status}</div>
              </div>
            ))
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No attendance records yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
