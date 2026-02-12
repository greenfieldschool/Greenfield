import type { ReactNode } from "react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import AdminShell from "./AdminShell";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.role as string | null | undefined;
  const isStaff =
    role === "super_admin" ||
    role === "admin" ||
    role === "teacher" ||
    role === "front_desk" ||
    role === "nurse";

  if (!isStaff) {
    return <>{children}</>;
  }

  return <AdminShell userEmail={user.email ?? ""}>{children}</AdminShell>;
}
