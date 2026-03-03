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

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full lg:w-64">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold text-slate-500">Signed in</div>
            <div className="mt-1 truncate text-sm font-semibold text-slate-900">{user.email}</div>

            <nav className="mt-5 space-y-1 text-sm">
              <Link className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50" href="/portal">
                Dashboard
              </Link>
              {role === "parent" ? (
                <Link className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50" href="/portal/profile">
                  My profile
                </Link>
              ) : null}
              <Link className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50" href="/portal/students">
                {role === "student" ? "My profile" : "My students"}
              </Link>
              {role === "parent" ? (
                <Link className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50" href="/portal/academics">
                  Academics
                </Link>
              ) : null}
              {role === "parent" ? (
                <Link className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50" href="/portal/discipline">
                  Discipline
                </Link>
              ) : null}
              {role === "student" ? (
                <>
                  <Link
                    className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                    href="/portal/academics"
                  >
                    Academics
                  </Link>
                  <Link className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50" href="/portal/exams">
                    Exams
                  </Link>
                  <Link
                    className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                    href="/portal/exams/results"
                  >
                    Exam results
                  </Link>
                </>
              ) : null}
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/portal/activities"
              >
                Activities
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/portal/attendance"
              >
                Attendance
              </Link>
              <Link
                className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                href="/portal/incidents"
              >
                Incidents / Health
              </Link>
              {role === "parent" ? (
                <Link
                  className="block rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-50"
                  href="/portal/billing"
                >
                  Billing
                </Link>
              ) : null}
            </nav>

            <form className="mt-5" action="/portal/logout" method="post">
              <button
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                type="submit"
              >
                Sign out
              </button>
            </form>
          </div>
        </aside>

        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
