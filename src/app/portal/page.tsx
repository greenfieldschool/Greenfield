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

  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  const displayName = student
    ? `${student.first_name} ${student.last_name}`
    : guardian?.full_name ?? user?.email?.split("@")[0] ?? "there";

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {errorMsg ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
          <div className="font-semibold">Portal temporarily unavailable</div>
          <div className="mt-1 text-xs opacity-80">{errorMsg}</div>
        </div>
      ) : null}

      {/* Hero Welcome Card */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 p-8 text-white shadow-xl">
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-8 right-16 h-32 w-32 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute bottom-4 right-4 h-16 w-16 rounded-full bg-white/5" />

        <div className="relative">
          <div className="text-sm font-medium text-emerald-100">Greenfield School Portal</div>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            {greeting()}, {displayName}! 👋
          </h1>
          <p className="mt-2 max-w-lg text-sm text-emerald-100">
            {role === "student"
              ? "Welcome to your student portal. Access your academic records, exams, attendance, and more."
              : "Welcome to the parent portal. Monitor your child's academic journey and stay connected with the school."}
          </p>

          {/* Student info chips */}
          {role === "student" && student ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white`}>
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                {student.level.charAt(0).toUpperCase() + student.level.slice(1)}
              </span>
              {student.classes ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                  {student.classes.name}
                </span>
              ) : null}
              {student.admission_number ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                  </svg>
                  {student.admission_number}
                </span>
              ) : null}
              <span className={`inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white`}>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                {student.status.charAt(0).toUpperCase() + student.status.slice(1)}
              </span>
            </div>
          ) : null}

          {/* Guardian info */}
          {role === "parent" && guardian ? (
            <div className="mt-4 flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Parent / Guardian
              </span>
            </div>
          ) : null}
        </div>
      </div>

      {/* No student linked warning */}
      {role === "student" && !student ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100">
              <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <div className="font-semibold text-amber-900">Account not linked to a student record</div>
              <p className="mt-1 text-sm text-amber-800">
                Your login account is not yet connected to a student profile. Please contact the school administrator to complete the setup.
              </p>
              <div className="mt-2 text-xs text-amber-700">
                Signed in as: <span className="font-mono font-semibold">{user?.email}</span>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Quick nav grid — Student */}
      {role === "student" ? (
        <div>
          <h2 className="mb-4 text-base font-semibold text-slate-700">Quick access</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/portal/students"
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-green/40 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 group-hover:bg-brand-green/10 transition-colors">
                <svg className="h-5 w-5 text-slate-600 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">My Profile</div>
              <div className="mt-1 text-xs text-slate-500">View your student details and records.</div>
            </Link>

            <Link
              href="/portal/exams"
              className="group relative overflow-hidden rounded-2xl border border-brand-green/30 bg-gradient-to-br from-brand-green/5 to-teal-50 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-green/10 transition-colors">
                <svg className="h-5 w-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">Exams</div>
              <div className="mt-1 text-xs text-slate-500">Take exams and view your results.</div>
            </Link>

            <Link
              href="/portal/academics"
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 group-hover:bg-indigo-100 transition-colors">
                <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">Academics</div>
              <div className="mt-1 text-xs text-slate-500">View grades and assessment scores.</div>
            </Link>

            <Link
              href="/portal/attendance"
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 group-hover:bg-cyan-100 transition-colors">
                <svg className="h-5 w-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">Attendance</div>
              <div className="mt-1 text-xs text-slate-500">Track your attendance record.</div>
            </Link>

            <Link
              href="/portal/activities"
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 group-hover:bg-amber-100 transition-colors">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">Activities</div>
              <div className="mt-1 text-xs text-slate-500">Clubs, sports, and extracurriculars.</div>
            </Link>

            <Link
              href="/portal/incidents"
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 group-hover:bg-rose-100 transition-colors">
                <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">Health & Incidents</div>
              <div className="mt-1 text-xs text-slate-500">View health and incident records.</div>
            </Link>
          </div>
        </div>
      ) : null}

      {/* Quick nav grid — Parent */}
      {role === "parent" ? (
        <div>
          <h2 className="mb-4 text-base font-semibold text-slate-700">Quick access</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link
              href="/portal/profile"
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-green/40 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 group-hover:bg-brand-green/10 transition-colors">
                <svg className="h-5 w-5 text-slate-600 group-hover:text-brand-green transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">My Profile</div>
              <div className="mt-1 text-xs text-slate-500">View your guardian profile details.</div>
            </Link>

            <Link
              href="/portal/students"
              className="group rounded-2xl border border-brand-green/30 bg-gradient-to-br from-brand-green/5 to-teal-50 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-green/10 transition-colors">
                <svg className="h-5 w-5 text-brand-green" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">My Students</div>
              <div className="mt-1 text-xs text-slate-500">View all linked student profiles.</div>
            </Link>

            <Link
              href="/portal/academics"
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 group-hover:bg-indigo-100 transition-colors">
                <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">Academics</div>
              <div className="mt-1 text-xs text-slate-500">View academic records and reports.</div>
            </Link>

            <Link
              href="/portal/attendance"
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-cyan-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-50 group-hover:bg-cyan-100 transition-colors">
                <svg className="h-5 w-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">Attendance</div>
              <div className="mt-1 text-xs text-slate-500">Track attendance records.</div>
            </Link>

            <Link
              href="/portal/billing"
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
                <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">Billing</div>
              <div className="mt-1 text-xs text-slate-500">View invoices and make payments.</div>
            </Link>

            <Link
              href="/portal/incidents"
              className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-rose-200 hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 group-hover:bg-rose-100 transition-colors">
                <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <div className="mt-3 font-semibold text-slate-900">Health & Incidents</div>
              <div className="mt-1 text-xs text-slate-500">View health and incident updates.</div>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
