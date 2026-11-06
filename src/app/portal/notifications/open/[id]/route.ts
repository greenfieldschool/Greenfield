import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { safePortalLink } from "@/lib/notifications";

// Tapping a notification: mark it read, then open what it's about. Only the person's own notification is found
// (the database's rules), and only links inside the portal are followed.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  const home = new URL("/portal/notifications", request.url);
  if (!supabase || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.redirect(home);
  const { data } = await supabase.from("notifications").select("link").eq("id", id).maybeSingle();
  if (!data) return NextResponse.redirect(home);
  await supabase.rpc("mark_notifications_read", { p_ids: [id] });
  return NextResponse.redirect(new URL(safePortalLink((data as { link: string | null }).link), request.url));
}
