import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type StudentGuardianRow = { student_id: string };

type StudentRow = { id: string; first_name: string; last_name: string };

type EnrollmentRow = {
  id: string;
  student_id: string;
  status: string;
  activities: Array<{ id: string; name: string; description: string | null }>;
};

type ActivityRow = {
  id: string;
  name: string;
  description: string | null;
};

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

export default async function PortalActivitiesPage({
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

  let role: string | null = null;
  let studentId: string | null = null;
  let parentStudents: StudentRow[] = [];

  try {
    const { data: identityRows, error: identityError } = await withTimeout(
      supabase.rpc("portal_identity"),
      6000
    );
    if (identityError) {
      errorMsg = String(identityError.message ?? "");
    }

    const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : null) as {
      role?: string | null;
      student_id?: string | null;
      guardian_id?: string | null;
    } | null;

    role = identity?.role ?? null;
    if (role !== "student" && role !== "parent") return null;

    const sp = (await searchParams) ?? {};
    const selectedStudentIdRaw = sp.student_id;
    const selectedStudentId = Array.isArray(selectedStudentIdRaw)
      ? (selectedStudentIdRaw[0] ?? "")
      : (selectedStudentIdRaw ?? "");

    if (role === "student") {
      studentId = identity?.student_id ?? null;
    }

    if (role === "parent") {
      const guardianId = identity?.guardian_id ?? null;
      if (!guardianId) return null;

      const { data: links } = await withTimeout(
        supabase.from("student_guardians").select("student_id").eq("guardian_id", guardianId),
        6000
      );

      const studentIds = (links as StudentGuardianRow[] | null | undefined)
        ?.map((r) => r.student_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0) ?? [];

      if (!studentIds.length) return null;

      const { data: studentsData } = await withTimeout(
        supabase
          .from("students")
          .select("id, first_name, last_name")
          .in("id", studentIds)
          .order("last_name", { ascending: true })
          .order("first_name", { ascending: true }),
        6000
      );

      parentStudents = (studentsData ?? []) as StudentRow[];
      const fallbackId = parentStudents[0]?.id ?? studentIds[0] ?? null;
      studentId = selectedStudentId.length ? selectedStudentId : fallbackId;
    }
  } catch (e) {
    if (!errorMsg) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  if (!studentId) return null;

  let enrollments: EnrollmentRow[] = [];
  let availableActivities: ActivityRow[] = [];

  try {
    const { data: enrollmentData } = await withTimeout(
      supabase
        .from("activity_enrollments")
        .select("id, student_id, status, activities(id, name, description)")
        .eq("student_id", studentId),
      6000
    );

    enrollments = (enrollmentData ?? []).map((row) => {
      const r = row as {
        id?: string;
        student_id?: string;
        status?: string;
        activities?: unknown;
      };
      return {
        id: typeof r.id === "string" ? r.id : "",
        student_id: typeof r.student_id === "string" ? r.student_id : "",
        status: typeof r.status === "string" ? r.status : "active",
        activities: Array.isArray(r.activities)
          ? (r.activities as Array<{ id?: string; name?: string; description?: string | null }>).map((a) => ({
              id: typeof a?.id === "string" ? a.id : "",
              name: typeof a?.name === "string" ? a.name : "Activity",
              description: typeof a?.description === "string" ? a.description : null
            }))
          : r.activities && typeof r.activities === "object"
            ? [
                {
                  id: typeof (r.activities as { id?: string }).id === "string" ? (r.activities as { id: string }).id : "",
                  name:
                    typeof (r.activities as { name?: string }).name === "string"
                      ? (r.activities as { name: string }).name
                      : "Activity",
                  description:
                    typeof (r.activities as { description?: string | null }).description === "string"
                      ? (r.activities as { description: string }).description
                      : null
                }
              ]
            : []
      };
    });

    const { data: activitiesData } = await withTimeout(
      supabase.from("activities").select("id, name, description").order("name", { ascending: true }).limit(100),
      6000
    );

    availableActivities = (activitiesData ?? []) as ActivityRow[];
  } catch (e) {
    if (!errorMsg) {
      errorMsg = e instanceof Error ? e.message : String(e);
    }
  }

  const enrolledActivityIds = new Set(enrollments.flatMap((e) => e.activities.map((a) => a.id)));

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Portal</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Activities</h1>
        {role === "parent" && parentStudents.length > 1 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {parentStudents.map((st) => {
              const active = st.id === studentId;
              return (
                <Link
                  key={st.id}
                  href={`/portal/activities?student_id=${st.id}`}
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
        <p className="mt-2 text-sm text-slate-600">View enrolled activities and clubs.</p>

        {errorMsg ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
            <div className="text-sm font-semibold">Activities temporarily unavailable</div>
            <div className="mt-2 text-xs opacity-80">{errorMsg}</div>
          </div>
        ) : null}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Enrolled activities</h2>
        <p className="mt-1 text-sm text-slate-600">Activities and clubs you are currently enrolled in.</p>

        <div className="mt-4 space-y-3">
          {enrollments.length ? (
            enrollments.map((e) => {
              const activity = e.activities[0] ?? null;
              return (
                <div key={e.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-900">{activity?.name ?? "Activity"}</div>
                      {activity?.description ? (
                        <div className="mt-1 text-sm text-slate-600">{activity.description}</div>
                      ) : null}
                    </div>
                    <div className="text-xs font-semibold text-slate-700">Status: {e.status}</div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-sm text-slate-600">No activities enrolled yet.</div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Available activities</h2>
        <p className="mt-1 text-sm text-slate-600">Other activities and clubs available at the school.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {availableActivities.filter((a) => !enrolledActivityIds.has(a.id)).length ? (
            availableActivities
              .filter((a) => !enrolledActivityIds.has(a.id))
              .map((a) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                  <div className="font-semibold text-slate-900">{a.name}</div>
                  {a.description ? <div className="mt-1 text-sm text-slate-600">{a.description}</div> : null}
                </div>
              ))
          ) : (
            <div className="text-sm text-slate-600 sm:col-span-2">No other activities available.</div>
          )}
        </div>
      </div>
    </div>
  );
}
