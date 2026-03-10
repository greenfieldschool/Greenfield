import { getSupabaseServerClient } from "@/lib/supabase/server";

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

type IdentityRow = {
  role: string | null;
  student_id: string | null;
  guardian_id: string | null;
};

type StudentRow = {
  id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  profile_photo_url: string | null;
  hobbies: string[];
  level: string;
  status: string;
  date_of_birth: string | null;
  admission_number?: string | null;
  class_id?: string | null;
  classes?:
    | { id: string; level: string; name: string }
    | Array<{ id: string; level: string; name: string }>
    | null;
  sex?: string | null;
  religion?: string | null;
  favorite_sports?: string | null;
  future_aspiration?: string | null;
};

function firstOrNull<T>(v: T | T[] | null | undefined) {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

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

  let errorMsg: string | null = null;

  const { data: profile, error: profileError } = await withTimeout(
    supabase.rpc("portal_identity").maybeSingle(),
    6000
  );
  if (profileError) {
    errorMsg = String(profileError.message ?? "");
  }

  const role = ((profile ?? null) as unknown as IdentityRow | null)?.role ?? null;

  let students: StudentRow[] = [];

  if (role === "student") {
    const studentId = ((profile ?? null) as unknown as IdentityRow | null)?.student_id ?? null;
    if (studentId) {
      const { data } = await withTimeout(
        supabase
          .from("students")
          .select(
            "id, first_name, middle_name, last_name, profile_photo_url, hobbies, level, status, date_of_birth, admission_number, class_id, classes!students_class_id_fkey(id, level, name), sex, religion, favorite_sports, future_aspiration"
          )
          .eq("id", studentId),
        6000
      );

      students = (data ?? []) as StudentRow[];
    }
  }

  if (role === "parent") {
    const guardianId = ((profile ?? null) as unknown as IdentityRow | null)?.guardian_id ?? null;
    if (guardianId) {
      const { data: studentLinks } = await supabase
        .from("student_guardians")
        .select("student_id")
        .eq("guardian_id", guardianId);

      const studentIds = (studentLinks ?? [])
        .map((r) => r.student_id as string)
        .filter((id): id is string => typeof id === "string" && id.length > 0);

      if (studentIds.length) {
        const { data } = await withTimeout(
          supabase
            .from("students")
            .select(
              "id, first_name, middle_name, last_name, profile_photo_url, hobbies, level, status, date_of_birth, admission_number, class_id, classes!students_class_id_fkey(id, level, name), sex, religion, favorite_sports, future_aspiration"
            )
            .in("id", studentIds)
            .order("last_name", { ascending: true }),
          6000
        );

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

      {errorMsg ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <div className="text-sm font-semibold">Profile temporarily unavailable</div>
          <div className="mt-2 text-xs opacity-80">{errorMsg}</div>
        </div>
      ) : null}

      <div className="mt-6 space-y-4">
        {students.map((s) => {
          const enrollments = enrollmentsByStudentId.get(s.id) ?? [];
          const cls = firstOrNull(s.classes);
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
                      {s.first_name} {s.middle_name ? `${s.middle_name} ` : ""}{s.last_name}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {s.level} • {s.status}
                      {s.date_of_birth ? ` • DOB: ${s.date_of_birth}` : ""}
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {cls ? `Class: ${cls.level} - ${cls.name}` : s.class_id ? "Class: —" : "Class: not assigned"}
                      {s.admission_number ? ` • Admission: ${s.admission_number}` : ""}
                      {s.sex ? ` • Sex: ${s.sex}` : ""}
                      {s.religion ? ` • Religion: ${s.religion}` : ""}
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

              {(s.favorite_sports || s.future_aspiration) ? (
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  {s.favorite_sports ? (
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Favorite sports</div>
                      <div className="mt-1 text-sm text-slate-700">{s.favorite_sports}</div>
                    </div>
                  ) : null}
                  {s.future_aspiration ? (
                    <div>
                      <div className="text-xs font-semibold text-slate-500">Future aspiration</div>
                      <div className="mt-1 text-sm text-slate-700">{s.future_aspiration}</div>
                    </div>
                  ) : null}
                </div>
              ) : null}
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
