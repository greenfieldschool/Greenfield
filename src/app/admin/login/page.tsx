import { AdminLoginForm } from "@/app/admin/login/ui";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { safeRedirect } from "@/lib/route-access";

export default function AdminLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  return <AdminLoginGuard redirectTo={safeRedirect(searchParams.redirectTo, "admin")} />;
}

async function AdminLoginGuard({ redirectTo }: { redirectTo: string }) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user }
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  if (user) {
    redirect(redirectTo);
  }

  return <AdminLoginForm redirectTo={redirectTo} />;
}
