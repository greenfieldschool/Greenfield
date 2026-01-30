import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  await supabase?.auth.signOut();
  return NextResponse.redirect(new URL("/portal/login", request.url));
}
