import { getSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  level: string;
  status: string;
};

export default async function PortalHomePage() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user }
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  let role: string | null = null;
  let student: StudentRow | null = null;

  if (supabase && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    role = (profile?.role as string | null | undefined) ?? null;

    if (role === "student") {
      const { data: link } = await supabase
        .from("student_user_links")
        .select("student_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (link?.student_id) {
        const { data } = await supabase
          .from("students")
          .select("id, first_name, last_name, level, status")
          .eq("id", link.student_id)
          .maybeSingle();

        student = (data ?? null) as StudentRow | null;
      }
    }
  }

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <div className="text-sm font-semibold text-slate-500">Portal</div>
      <h1 className="mt-2 text-2xl font-semibold text-slate-900">Welcome</h1>
      <p className="mt-2 text-sm text-slate-600">
        {role === "student"
          ? "View your profile, activities, attendance, and school updates."
          : "View your students, activities, attendance, and school updates."}
      </p>
      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">Signed in as</div>
        <div className="mt-1">{user?.email ?? "Unknown"}</div>
        {role === "student" ? (
          <div className="mt-4">
            <div className="font-semibold text-slate-900">Student</div>
            <div className="mt-1">
              {student ? `${student.first_name} ${student.last_name}` : "No student linked yet."}
            </div>
            {student ? <div className="mt-1 text-xs text-slate-600">Level: {student.level}</div> : null}
          </div>
        ) : null}
      </div>

      {role === "student" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/students"
          >
            <div className="font-semibold text-slate-900">My profile</div>
            <div className="mt-1 text-xs text-slate-600">View your student details.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/attendance"
          >
            <div className="font-semibold text-slate-900">Attendance</div>
            <div className="mt-1 text-xs text-slate-600">Track your attendance record.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/academics"
          >
            <div className="font-semibold text-slate-900">Academics</div>
            <div className="mt-1 text-xs text-slate-600">View academic records and reports.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/discipline"
          >
            <div className="font-semibold text-slate-900">Discipline</div>
            <div className="mt-1 text-xs text-slate-600">View discipline records.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 sm:col-span-2"
            href="/portal/incidents"
          >
            <div className="font-semibold text-slate-900">Incidents / Health</div>
            <div className="mt-1 text-xs text-slate-600">View incident and health updates.</div>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
