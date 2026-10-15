import type { ReactNode } from "react";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Logo } from "@/components/ui/logo";
import { buttonClasses } from "@/components/ui/button";

export default async function ConductorLayout({ children }: { children: ReactNode }) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user }
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  // Signed-out visitors only reach the login page (middleware redirects everything else),
  // which brings its own full-screen layout.
  if (!user) return <>{children}</>;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/conductor" className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-green-500/25">
            <Logo subtitle="Exam conductor" />
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            <div className="hidden min-w-0 truncate text-sm font-medium text-slate-600 sm:block">{user?.email ?? ""}</div>
            <form action="/conductor/logout" method="post">
              <button type="submit" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
