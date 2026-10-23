import type { ReactNode } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import AdminShell from "./AdminShell";
import { ToastProvider } from "@/components/toast-provider";
import { ServiceUnavailable } from "@/components/ui/service-unavailable";

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
      return <ServiceUnavailable area="The staff dashboard" timeout={isTimeout} detail={msg} />;
    }
    role = (profile?.role as string | null | undefined) ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const isTimeout = msg.toLowerCase().includes("timeout");
    return <ServiceUnavailable area="The staff dashboard" timeout={isTimeout} detail={msg} />;
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

  // Badge on "Messages". Never blocks the page: missing table or slow query just means no badge.
  let unreadMessages = 0;
  if (role === "teacher" || role === "admin" || role === "super_admin") {
    try {
      const { data } = await withTimeout(Promise.resolve(supabase.rpc("chat_unread_total")), 2500);
      unreadMessages = Number(data ?? 0) || 0;
    } catch {
      unreadMessages = 0;
    }
  }

  return (
    <ToastProvider>
      <AdminShell userEmail={user.email ?? ""} role={(role ?? null) as string | null} unreadMessages={unreadMessages}>
        {children}
      </AdminShell>
    </ToastProvider>
  );
}
