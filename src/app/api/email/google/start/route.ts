import { randomBytes } from "crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { googleAuthUrl, googleConfigured } from "@/lib/email/gmail";
import { sign } from "@/lib/email/secret";

// "Connect Gmail" (admins): sends them to Google to sign in as the school account and allow sending email.
export async function GET(request: NextRequest) {
  const settings = new URL("/admin/settings", request.url);
  const fail = (m: string) => NextResponse.redirect(`${settings.toString()}?toast=${encodeURIComponent(m)}&toast_type=error#email`);
  if (!googleConfigured()) return fail("Email isn't set up on the server yet (Google client ID, secret and EMAIL_TOKEN_KEY). See the set-up guide.");
  const supabase = getSupabaseServerClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !auth.user) return NextResponse.redirect(new URL("/admin/login", request.url));
  const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["admin", "super_admin"].includes((me as { role?: string } | null)?.role ?? "")) return fail("Only admins can connect Gmail.");

  const nonce = randomBytes(16).toString("base64url");
  const state = `${nonce}.${sign(`gmail:${auth.user.id}:${nonce}`)}`;
  const redirectUri = new URL("/api/email/google/callback", request.url).toString();
  const res = NextResponse.redirect(googleAuthUrl(redirectUri, state));
  res.cookies.set("gf_gmail_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/email/google", maxAge: 600 });
  return res;
}
