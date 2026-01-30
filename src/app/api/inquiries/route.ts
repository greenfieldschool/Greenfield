import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "Expected JSON body." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | { name?: unknown; email?: unknown; message?: unknown }
    | null;

  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";

  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: "Please enter your name." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  }
  if (message.length < 10) {
    return NextResponse.json({ ok: false, error: "Please enter a longer message." }, { status: 400 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    return NextResponse.json(
      { ok: false, error: "Server is missing Supabase configuration." },
      { status: 500 }
    );
  }

  const key = serviceRoleKey ?? anonKey;
  if (!key) {
    return NextResponse.json(
      { ok: false, error: "Server is missing Supabase API key configuration." },
      { status: 500 }
    );
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { error } = await supabase.from("inquiries").insert([
    {
      name,
      email,
      message,
      source: "web"
    }
  ]);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "We could not save your enquiry right now. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, message: "Submitted. We’ll be in touch soon." }, { status: 200 });
}
