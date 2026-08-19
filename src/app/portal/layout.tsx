import Link from "next/link";
import type { ReactNode } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";

async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
  return (await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
  ])) as T;
}

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return <>{children}</>;
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return <>{children}</>;
  }

  let role: string | null | undefined = null;
  let studentId: string | null = null;
  let studentName: string | null = null;
  try {
    const query = supabase.rpc("portal_identity");
    const { data: identityRows, error: identityError } = await withTimeout(Promise.resolve(query), 6000);

    if (identityError) {
      const msg = String(identityError.message ?? "");
      const isTimeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("databasetimeout");
      return (
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-900 shadow-sm">
            <div className="text-sm font-semibold">Portal temporarily unavailable</div>
            <div className="mt-2 text-sm">
              {isTimeout
                ? "The database connection timed out. Please wait a moment and reload."
                : "A database error occurred. Please reload."}
            </div>
            <div className="mt-4 text-xs opacity-80">{msg}</div>
          </div>
        </div>
      );
    }

    const identity = Array.isArray(identityRows) ? (identityRows[0] ?? null) : (identityRows as unknown);
    role = ((identity as { role?: string } | null)?.role as string | null | undefined) ?? null;
    studentId = ((identity as { student_id?: string } | null)?.student_id as string | null | undefined) ?? null;

    if (role === "student" && !studentId) {
      const { data: linkedStudentId } = await withTimeout(
        supabase.rpc("auto_link_student_by_email"),
        4000
      );
      if (linkedStudentId) {
        studentId = linkedStudentId as string;
      }
    }

    // Fetch student name for display
    if (role === "student" && studentId) {
      const { data: sData } = await supabase
        .from("students")
        .select("first_name, last_name")
        .eq("id", studentId)
        .maybeSingle();
      if (sData) {
        studentName = `${(sData as { first_name: string }).first_name} ${(sData as { last_name: string }).last_name}`;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.toLowerCase().includes("timeout");
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-900 shadow-sm">
          <div className="text-sm font-semibold">Portal temporarily unavailable</div>
          <div className="mt-2 text-sm">
            {isTimeout
              ? "The database connection timed out. Please wait a moment and reload."
              : "A server error occurred. Please reload."}
          </div>
          <div className="mt-4 text-xs opacity-80">{msg}</div>
        </div>
      </div>
    );
  }

  const isPortalRole = role === "parent" || role === "student";

  if (!isPortalRole) {
    return <>{children}</>;
  }

  const displayEmail = user.email ?? "";
  const displayName = studentName ?? displayEmail.split("@")[0];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Bar */}
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <Link href="/portal" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-green">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <span className="text-sm font-bold text-slate-900">Greenfield Portal</span>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-xs font-semibold text-slate-800">{displayName}</div>
              <div className="text-[11px] text-slate-400 truncate max-w-[200px]">{displayEmail}</div>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-green text-xs font-bold text-white">
              {displayName.charAt(0).toUpperCase()}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:flex lg:gap-8 lg:py-8">
        {/* Sidebar */}
        <aside className="mb-6 w-full shrink-0 lg:mb-0 lg:w-56">
          <nav className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <div className="mb-2 px-3 pt-1 pb-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {role === "student" ? "Student" : "Parent"}
            </div>
            <NavLink href="/portal" icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            }>Dashboard</NavLink>

            {role === "parent" ? (
              <NavLink href="/portal/profile" icon={
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              }>My Profile</NavLink>
            ) : null}

            <NavLink href="/portal/students" icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            }>{role === "student" ? "My Profile" : "My Students"}</NavLink>

            <NavLink href="/portal/academics" icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            }>Academics</NavLink>

            {role === "student" ? (
              <>
                <NavLink href="/portal/exams" icon={
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                }>Exams</NavLink>
                <NavLink href="/portal/exams/results" icon={
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                }>Exam Results</NavLink>
              </>
            ) : null}

            <NavLink href="/portal/attendance" icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            }>Attendance</NavLink>

            <NavLink href="/portal/activities" icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            }>Activities</NavLink>

            {role === "parent" ? (
              <>
                <NavLink href="/portal/discipline" icon={
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                }>Discipline</NavLink>
                <NavLink href="/portal/billing" icon={
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                }>Billing</NavLink>
              </>
            ) : null}

            <NavLink href="/portal/incidents" icon={
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            }>Health / Incidents</NavLink>

            {/* Sign Out */}
            <div className="mt-3 border-t border-slate-100 pt-3">
              <form action="/portal/logout" method="post">
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Sign out
                </button>
              </form>
            </div>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function NavLink({ href, children, icon }: { href: string; children: React.ReactNode; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-colors"
    >
      <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {icon}
      </svg>
      {children}
    </Link>
  );
}
