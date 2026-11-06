import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { accountEmail, exchangeCode } from "@/lib/email/gmail";
import { encryptSecret, verifySignature } from "@/lib/email/secret";

// Google sends the admin back here. Checks it's the same admin who started, keeps the long-lived key encrypted,
// and records which Gmail address will send.
export async function GET(request: NextRequest) {
  const settings = new URL("/admin/settings", request.url).toString();
  const done = (m: string, type: "success" | "error") => {
    const res = NextResponse.redirect(`${settings}?toast=${encodeURIComponent(m)}&toast_type=${type}#email`);
    res.cookies.delete({ name: "gf_gmail_state", path: "/api/email/google" });
    return res;
  };
  const q = request.nextUrl.searchParams;
  if (q.get("error")) return done("Gmail wasn't connected: permission was not given.", "error");

  const supabase = getSupabaseServerClient();
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  if (!supabase || !auth.user) return NextResponse.redirect(new URL("/admin/login", request.url));
  const { data: me } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
  if (!["admin", "super_admin"].includes((me as { role?: string } | null)?.role ?? "")) return done("Only admins can connect Gmail.", "error");

  const state = q.get("state") ?? "";
  const cookie = request.cookies.get("gf_gmail_state")?.value ?? "";
  const [nonce, sig] = state.split(".");
  if (!state || state !== cookie || !nonce || !sig || !verifySignature(`gmail:${auth.user.id}:${nonce}`, sig)) {
    return done("That sign-in link had expired. Click Connect Gmail again.", "error");
  }

  const redirectUri = new URL("/api/email/google/callback", request.url).toString();
  const tokens = await exchangeCode(q.get("code") ?? "", redirectUri);
  if (!tokens.access_token) return done(`Google didn't accept the sign-in (${tokens.error ?? "unknown"}). Try again.`, "error");
  if (!tokens.scope?.includes("gmail.send")) return done("Tick the box that lets the website send email, then try again.", "error");
  if (!tokens.refresh_token) return done("Google didn't give a lasting connection. Remove the website under your Google account's third-party access, then connect again.", "error");
  const email = await accountEmail(tokens.access_token);
  if (!email) return done("Couldn't read the Gmail address. Try again.", "error");

  const service = getSupabaseServiceClient() as SupabaseClient | null;
  if (!service) return done("The school's service key is not set on the server.", "error");
  const { error } = await service.from("email_settings").upsert(
    {
      id: true,
      sender_email: email,
      refresh_token_enc: encryptSecret(tokens.refresh_token),
      connected_at: new Date().toISOString(),
      connected_by: auth.user.id,
      last_error: null,
      last_error_at: null
    },
    { onConflict: "id" }
  );
  if (error) return done(/does not exist|schema cache/i.test(error.message) ? "Run the database update 20261110_email.sql first." : "Couldn't save the connection. Try again.", "error");
  return done(`Gmail connected. Emails will be sent from ${email}.`, "success");
}
