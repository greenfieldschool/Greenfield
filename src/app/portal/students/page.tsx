import { getSupabaseServerClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  profile_photo_url: string | null;
  hobbies: string[];
  level: string;
  status: string;
  date_of_birth: string | null;
};

type EnrollmentRow = {
  student_id: string;
  status: string;
  activities: Array<{ name: string; description: string | null }>;
};

export default async function PortalStudentsPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return null;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as string | null | undefined;

  let students: StudentRow[] = [];

  if (role === "student") {
    const { data: link } = await supabase
      .from("student_user_links")
      .select("student_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (link?.student_id) {
      const { data } = await supabase
        .from("students")
        .select("id, first_name, last_name, profile_photo_url, hobbies, level, status, date_of_birth")
        .eq("id", link.student_id);

      students = (data ?? []) as StudentRow[];
    }
  }

  if (role === "parent") {
    const { data: guardianLink } = await supabase
      .from("guardian_user_links")
      .select("guardian_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (guardianLink?.guardian_id) {
      const { data: studentLinks } = await supabase
        .from("student_guardians")
        .select("student_id")
        .eq("guardian_id", guardianLink.guardian_id);

      const studentIds = (studentLinks ?? [])
        .map((r) => r.student_id as string)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      if (studentIds.length) {
        const { data } = await supabase
          .from("students")
          .select("id, first_name, last_name, profile_photo_url, hobbies, level, status, date_of_birth")
          .in("id", studentIds)
          .order("last_name", { ascending: true });

        students = (data ?? []) as StudentRow[];
      }
    }
  }

  const studentIds = students.map((s) => s.id);

  const enrollmentsByStudentId = new Map<string, EnrollmentRow[]>();
  if (studentIds.length) {
    const { data } = await supabase
      .from("activity_enrollments")
      .select("student_id, status, activities(name, description)")
      .in("student_id", studentIds);

    const rows = (data ?? []) as unknown[];
    for (const raw of rows) {
      const r = raw as {
        student_id?: unknown;
        status?: unknown;
        activities?: unknown;
      };

      const studentId = typeof r.student_id === "string" ? r.student_id : "";
      if (!studentId) continue;

      const status = typeof r.status === "string" ? r.status : "active";
      const activities = Array.isArray(r.activities)
        ? (r.activities as Array<{ name?: unknown; description?: unknown }>).map((a) => ({
            name: typeof a?.name === "string" ? a.name : "Activity",
            description: typeof a?.description === "string" ? a.description : null
          }))
        : [];

      const normalized: EnrollmentRow = { student_id: studentId, status, activities };

      const list = enrollmentsByStudentId.get(studentId) ?? [];
      list.push(normalized);
      enrollmentsByStudentId.set(studentId, list);
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">Portal</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">
        {role === "student" ? "My profile" : "My students"}
      </h1>
      <p className="mt-2 text-sm text-slate-600">
        {role === "student" ? "Your student profile." : "Students linked to your parent account."}
      </p>

      <div className="mt-6 space-y-4">
        {students.map((s) => {
          const enrollments = enrollmentsByStudentId.get(s.id) ?? [];
          return (
            <div key={s.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-4">
                  <div className="h-14 w-14 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    {s.profile_photo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="h-full w-full object-cover" alt="" src={s.profile_photo_url} />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-semibold text-slate-900">
                      {s.first_name} {s.last_name}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {s.level} • {s.status}
                      {s.date_of_birth ? ` • DOB: ${s.date_of_birth}` : ""}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <div>
                  <div className="text-xs font-semibold text-slate-500">Hobbies</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(s.hobbies ?? []).length ? (
                      (s.hobbies ?? []).map((h) => (
                        <span key={h} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700">
                          {h}
                        </span>
                      ))
                    ) : (
                      <div className="text-sm text-slate-600">—</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-slate-500">Clubs / Activities</div>
                  <div className="mt-2 space-y-2">
                    {enrollments.length ? (
                      enrollments.map((e, idx) => (
                        <div key={`${e.student_id}-${idx}`} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                          <div className="text-sm font-semibold text-slate-900">
                            {e.activities?.[0]?.name ?? "Activity"}
                          </div>
                          <div className="mt-1 text-xs text-slate-600">Status: {e.status}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-sm text-slate-600">—</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!students.length ? (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-6 text-sm text-slate-600">
          No students are linked to this account yet.
        </div>
      ) : null}
    </div>
  );
}
