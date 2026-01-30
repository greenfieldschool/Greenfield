import { getSupabaseServerClient } from "@/lib/supabase/server";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  level: string;
  status: string;
  date_of_birth: string | null;
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
        .select("id, first_name, last_name, level, status, date_of_birth")
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
          .select("id, first_name, last_name, level, status, date_of_birth")
          .in("id", studentIds)
          .order("last_name", { ascending: true });

        students = (data ?? []) as StudentRow[];
      }
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">Portal</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">My students</h1>
      <p className="mt-2 text-sm text-slate-600">
        {role === "student" ? "Your student profile." : "Students linked to your parent account."}
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-5">Name</div>
          <div className="col-span-3">Level</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">DOB</div>
        </div>
        <div>
          {students.length ? (
            students.map((s) => (
              <div
                key={s.id}
                className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm text-slate-700"
              >
                <div className="col-span-5 font-semibold text-slate-900">
                  {s.first_name} {s.last_name}
                </div>
                <div className="col-span-3">{s.level}</div>
                <div className="col-span-2">{s.status}</div>
                <div className="col-span-2">{s.date_of_birth ?? "—"}</div>
              </div>
            ))
          ) : (
            <div className="px-6 py-6 text-sm text-slate-600">
              No students are linked to this account yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
