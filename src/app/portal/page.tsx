import { getSupabaseServerClient } from "@/lib/supabase/server";
import Link from "next/link";

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

type StudentRow = {
  id: string;
  first_name: string;
  last_name: string;
  level: string;
  status: string;
  admission_number: string | null;
  classes: { id: string; level: string; name: string } | null;
};

type GuardianRow = {
  id: string;
  full_name: string;
};

export default async function PortalHomePage() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user }
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  let role: string | null = null;
  let student: StudentRow | null = null;
  let guardian: GuardianRow | null = null;
  let errorMsg: string | null = null;

  if (supabase && user) {
    try {
      const { data: identityRows, error: identityError } = await withTimeout(
        supabase.rpc("portal_identity"),
        6000
      );
      if (identityError) {
        errorMsg = String(identityError.message ?? "");
      }

      const identity = Array.isArray(identityRows) ? (identityRows[0] ?? null) : (identityRows as unknown);
      role = ((identity as { role?: string } | null)?.role as string | null | undefined) ?? null;

      const studentId = (identity as { student_id?: string | null } | null)?.student_id ?? null;
      const guardianId = (identity as { guardian_id?: string | null } | null)?.guardian_id ?? null;

      if (role === "student" && studentId) {
        const { data } = await withTimeout(
          supabase
            .from("students")
            .select("id, first_name, last_name, level, status, admission_number, classes!students_class_id_fkey(id, level, name)")
            .eq("id", studentId)
            .maybeSingle(),
          6000
        );

        student = (data ?? null) as StudentRow | null;
      }

      if (role === "parent" && guardianId) {
        const { data } = await withTimeout(
          supabase
            .from("guardians")
            .select("id, full_name")
            .eq("id", guardianId)
            .maybeSingle(),
          6000
        );

        guardian = (data ?? null) as GuardianRow | null;
      }
    } catch (e) {
      if (!errorMsg) {
        errorMsg = e instanceof Error ? e.message : String(e);
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
      {errorMsg ? (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-950">
          <div className="text-sm font-semibold">Portal temporarily unavailable</div>
          <div className="mt-2 text-xs opacity-80">{errorMsg}</div>
        </div>
      ) : null}

      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
        <div className="font-semibold text-slate-900">Signed in as</div>
        <div className="mt-1">{user?.email ?? "Unknown"}</div>
        <div className="mt-1 text-xs text-slate-500">Role: {role ?? "Unknown"}</div>

        {role === "student" && student ? (
          <div className="mt-4">
            <div className="font-semibold text-slate-900">Student</div>
            <div className="mt-1">{student.first_name} {student.last_name}</div>
            <div className="mt-1 text-xs text-slate-600">
              Level: {student.level} • Status: {student.status}
              {student.admission_number ? ` • Admission: ${student.admission_number}` : ""}
            </div>
            {student.classes ? (
              <div className="mt-1 text-xs text-slate-600">
                Class: {student.classes.level} - {student.classes.name}
              </div>
            ) : null}
          </div>
        ) : role === "student" ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-sm font-semibold text-amber-900">No student record linked</div>
            <div className="mt-1 text-xs text-amber-800">
              Your account is not linked to a student record yet. Please contact the school administrator to link your account.
            </div>
          </div>
        ) : null}

        {role === "parent" && guardian ? (
          <div className="mt-4">
            <div className="font-semibold text-slate-900">Guardian</div>
            <div className="mt-1">{guardian.full_name}</div>
          </div>
        ) : role === "parent" ? (
          <div className="mt-4 text-sm text-amber-700">No guardian record linked yet.</div>
        ) : null}
      </div>

      {role === "student" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/students"
          >
            <div className="font-semibold text-slate-900">My profile</div>
            <div className="mt-1 text-xs text-slate-600">View your student details.</div>
          </Link>
          <Link
            className="rounded-2xl border border-brand-green/30 bg-brand-green/5 p-5 text-sm text-slate-700 shadow-sm hover:bg-brand-green/10"
            href="/portal/exams"
          >
            <div className="font-semibold text-slate-900">Exams</div>
            <div className="mt-1 text-xs text-slate-600">Take exams and view results.</div>
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
            href="/portal/attendance"
          >
            <div className="font-semibold text-slate-900">Attendance</div>
            <div className="mt-1 text-xs text-slate-600">Track your attendance record.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/activities"
          >
            <div className="font-semibold text-slate-900">Activities</div>
            <div className="mt-1 text-xs text-slate-600">View clubs and activities.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/discipline"
          >
            <div className="font-semibold text-slate-900">Discipline</div>
            <div className="mt-1 text-xs text-slate-600">View discipline records.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50 sm:col-span-2 lg:col-span-3"
            href="/portal/incidents"
          >
            <div className="font-semibold text-slate-900">Incidents / Health</div>
            <div className="mt-1 text-xs text-slate-600">View incident and health updates.</div>
          </Link>
        </div>
      ) : null}

      {role === "parent" ? (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/profile"
          >
            <div className="font-semibold text-slate-900">My profile</div>
            <div className="mt-1 text-xs text-slate-600">View your guardian profile.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/students"
          >
            <div className="font-semibold text-slate-900">My students</div>
            <div className="mt-1 text-xs text-slate-600">View linked student profiles.</div>
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
            href="/portal/attendance"
          >
            <div className="font-semibold text-slate-900">Attendance</div>
            <div className="mt-1 text-xs text-slate-600">Track attendance records.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/activities"
          >
            <div className="font-semibold text-slate-900">Activities</div>
            <div className="mt-1 text-xs text-slate-600">View clubs and activities.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/discipline"
          >
            <div className="font-semibold text-slate-900">Discipline</div>
            <div className="mt-1 text-xs text-slate-600">View discipline records.</div>
          </Link>
          <Link
            className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700 shadow-sm hover:bg-slate-50"
            href="/portal/incidents"
          >
            <div className="font-semibold text-slate-900">Incidents / Health</div>
            <div className="mt-1 text-xs text-slate-600">View incident and health updates.</div>
          </Link>
          <Link
            className="rounded-2xl border border-brand-green/30 bg-brand-green/5 p-5 text-sm text-slate-700 shadow-sm hover:bg-brand-green/10 sm:col-span-2 lg:col-span-2"
            href="/portal/billing"
          >
            <div className="font-semibold text-slate-900">Billing</div>
            <div className="mt-1 text-xs text-slate-600">View invoices and make payments.</div>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
