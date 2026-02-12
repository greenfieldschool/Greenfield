import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SaveBody = {
  id?: unknown;
  slug?: unknown;
  title?: unknown;
  location?: unknown;
  employment_type?: unknown;
  summary?: unknown;
  responsibilities?: unknown;
  requirements?: unknown;
  reports_to?: unknown;
  compensation?: unknown;
  apply_email?: unknown;
  apply_whatsapp?: unknown;
  apply_link?: unknown;
  published?: unknown;
};

function asString(v: unknown) {
  return typeof v === "string" ? v.trim() : "";
}

function asBool(v: unknown) {
  return v === true;
}

function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  if (typeof v === "string") {
    return v
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ ok: false, error: "Expected JSON body." }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "Supabase is not configured." }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as SaveBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const id = asString(body.id);

  const payload = {
    slug: asString(body.slug),
    title: asString(body.title),
    location: asString(body.location),
    employment_type: asString(body.employment_type),
    summary: asString(body.summary),
    responsibilities: asStringArray(body.responsibilities),
    requirements: asStringArray(body.requirements),
    reports_to: asString(body.reports_to) || null,
    compensation: asString(body.compensation) || null,
    apply_email: asString(body.apply_email) || null,
    apply_whatsapp: asString(body.apply_whatsapp) || null,
    apply_link: asString(body.apply_link) || null,
    published: asBool(body.published)
  };

  if (!payload.slug || !payload.title || !payload.location || !payload.employment_type || !payload.summary) {
    return NextResponse.json(
      { ok: false, error: "Please fill Title, Slug, Location, Employment type, and Summary." },
      { status: 400 }
    );
  }

  if (!id || id === "new") {
    const { data, error } = await supabase.from("career_jobs").insert([payload]).select("id").maybeSingle();
    if (error || !data?.id) {
      return NextResponse.json({ ok: false, error: "Could not save job." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, id: data.id as string }, { status: 200 });
  }

  const { error } = await supabase.from("career_jobs").update(payload).eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: "Could not save job." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id }, { status: 200 });
}
