import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("t")?.trim() ?? "";

  if (!token) {
    return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return NextResponse.json(
      { ok: false, error: "Server is missing Supabase service configuration." },
      { status: 500 }
    );
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data, error } = await supabase
    .from("admissions_applications")
    .select("id,resume_token,status,section,parent_name,phone,email,desired_start,preferred_contact,data,created_at,updated_at")
    .eq("resume_token", token)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "We could not find that application link." },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, application: data }, { status: 200 });
}
