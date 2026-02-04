import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

type UpdateBody = {
  token?: unknown;
  patch?: unknown;
  status?: unknown;
  section?: unknown;
  parent_name?: unknown;
  phone?: unknown;
  email?: unknown;
  desired_start?: unknown;
  preferred_contact?: unknown;
};

function asString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function asObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "Expected JSON body." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as UpdateBody | null;
  const token = asString(body?.token);

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

  const patch = asObject(body?.patch);

  const update: Record<string, unknown> = {};
  const nextStatus = asString(body?.status);
  const section = asString(body?.section);
  const parent_name = asString(body?.parent_name);
  const phone = asString(body?.phone);
  const email = asString(body?.email);
  const desired_start = asString(body?.desired_start);
  const preferred_contact = asString(body?.preferred_contact);

  if (nextStatus) update.status = nextStatus;
  if (section) update.section = section;
  if (parent_name) update.parent_name = parent_name;
  if (phone) update.phone = phone;
  if (email) update.email = email;
  if (desired_start) update.desired_start = desired_start;
  if (preferred_contact) update.preferred_contact = preferred_contact;

  if (Object.keys(patch).length > 0) {
    const { data: existing, error: readError } = await supabase
      .from("admissions_applications")
      .select("data")
      .eq("resume_token", token)
      .maybeSingle();

    if (readError || !existing) {
      return NextResponse.json({ ok: false, error: "Application not found." }, { status: 404 });
    }

    update.data = { ...(existing.data as Record<string, unknown>), ...patch };
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const { error } = await supabase
    .from("admissions_applications")
    .update(update)
    .eq("resume_token", token);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "We could not save your progress. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
