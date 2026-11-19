import type { SupabaseClient } from "@supabase/supabase-js";
import { SPENDING_BUCKET } from "@/lib/spending";

// Who is looking, and what they may do (the database decides; this only chooses what to show).
export type Viewer = {
  userId: string;
  role: string | null;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  limit: number;
  canPay: boolean;
  seesAll: boolean;
  missing: boolean;
};

export async function loadViewer(supabase: SupabaseClient): Promise<Viewer | null> {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const [{ data: profile }, perm] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    supabase.from("spending_permissions").select("approve_up_to, can_pay_out").eq("user_id", user.id).maybeSingle()
  ]);
  const role = (profile?.role as string | null) ?? null;
  const isAdmin = role === "admin" || role === "super_admin";
  const limit = Number(perm.data?.approve_up_to ?? 0) || 0;
  const canPay = Boolean(perm.data?.can_pay_out);
  return {
    userId: user.id,
    role,
    isAdmin,
    isSuperAdmin: role === "super_admin",
    limit,
    canPay,
    seesAll: isAdmin || limit > 0 || canPay,
    missing: Boolean(perm.error && /does not exist|schema cache/i.test(perm.error.message))
  };
}

/** 10-minute links to private receipt files, made with the viewer's own client so the bucket's rules decide. */
export async function signedLinks(supabase: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (!unique.length) return out;
  const { data } = await supabase.storage.from(SPENDING_BUCKET).createSignedUrls(unique, 600);
  for (const row of data ?? []) if (row.path && row.signedUrl) out.set(row.path, row.signedUrl);
  return out;
}
