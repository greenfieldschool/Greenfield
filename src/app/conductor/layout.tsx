import type { ReactNode } from "react";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function ConductorLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user }
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/conductor" className="text-sm font-semibold text-slate-900">
            Exam Conductor
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden text-xs font-semibold text-slate-600 sm:block">{user?.email ?? ""}</div>
            <form action="/conductor/logout" method="post">
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
