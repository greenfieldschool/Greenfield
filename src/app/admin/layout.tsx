import type { ReactNode } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminShell from "./AdminShell";

 async function withTimeout<T>(promise: PromiseLike<T>, ms: number) {
   return (await Promise.race([
     Promise.resolve(promise),
     new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))
   ])) as T;
 }

export default async function AdminLayout({ children }: { children: ReactNode }) {
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
    const query = supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const { data: profile, error: profileError } = await withTimeout(Promise.resolve(query), 6000);
    if (profileError) {
      const msg = String(profileError.message ?? "");
      const isTimeout = msg.toLowerCase().includes("timeout") || msg.toLowerCase().includes("databasetimeout");
      return (
        <div className="mx-auto max-w-3xl px-6 py-16">
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-900 shadow-sm">
            <div className="text-sm font-semibold">Admin temporarily unavailable</div>
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
    role = (profile?.role as string | null | undefined) ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.toLowerCase().includes("timeout");
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-8 text-amber-900 shadow-sm">
          <div className="text-sm font-semibold">Admin temporarily unavailable</div>
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
  const isStaff =
    role === "super_admin" ||
    role === "admin" ||
    role === "teacher" ||
    role === "front_desk" ||
    role === "nurse";

  if (!isStaff) {
    redirect("/admin/logout?next=/admin/login?unauthorized=1");
  }

  return (
    <AdminShell userEmail={user.email ?? ""} role={(role ?? null) as string | null}>
      {children}
    </AdminShell>
  );
}
