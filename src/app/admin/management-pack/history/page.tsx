import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { listSavedPacks } from "@/lib/mi-history";
import { parseView } from "@/lib/mi-periods";
import { HistoryView } from "./history-view";

export const dynamic = "force-dynamic";

// Saved management packs (admins only: adminOnlyPrefixes covers /admin/management-pack, RLS covers the table).
export default async function ManagementPackHistoryPage({ searchParams }: { searchParams?: Promise<{ view?: string }> }) {
  const sp = (await searchParams) ?? {};
  const supabase = getSupabaseServerClient() as SupabaseClient | null;
  if (!supabase) return null;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login?redirectTo=/admin/management-pack/history");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile as { role?: string } | null)?.role;
  if (role !== "admin" && role !== "super_admin") redirect("/admin/unauthorized");

  const view = parseView(sp.view);
  const { rows, error } = await listSavedPacks(supabase, view);
  return <HistoryView view={view} rows={rows} error={error} />;
}
