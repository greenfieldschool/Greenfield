import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "Expected JSON body." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | {
        parent_name?: unknown;
        phone?: unknown;
        email?: unknown;
        section?: unknown;
        desired_start?: unknown;
        preferred_contact?: unknown;
        note?: unknown;
      }
    | null;

  const parent_name = cleanString(body?.parent_name);
  const phone = cleanString(body?.phone);
  const email = cleanString(body?.email);
  const section = cleanString(body?.section);
  const desired_start = cleanString(body?.desired_start);
  const preferred_contact = cleanString(body?.preferred_contact);
  const note = cleanString(body?.note);

  if (parent_name.length < 2) {
    return NextResponse.json({ ok: false, error: "Please enter a parent/guardian name." }, { status: 400 });
  }
  if (phone.length < 7) {
    return NextResponse.json({ ok: false, error: "Please enter a valid phone number." }, { status: 400 });
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
    .insert([
      {
        status: "lead",
        section: section || null,
        parent_name,
        phone,
        email: email || null,
        desired_start: desired_start || null,
        preferred_contact: preferred_contact || null,
        data: {
          note: note || null
        }
      }
    ])
    .select("id,resume_token")
    .single();

  if (error || !data) {
    return NextResponse.json(
      { ok: false, error: "We could not start your application right now. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      id: data.id as string,
      resumeToken: data.resume_token as string
    },
    { status: 200 }
  );
}
