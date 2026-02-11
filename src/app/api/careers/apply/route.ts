import { NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

function asString(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ ok: false, error: "Expected multipart/form-data." }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Server is missing Supabase service configuration." },
      { status: 500 }
    );
  }

  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ ok: false, error: "Invalid form data." }, { status: 400 });
  }

  const jobSlug = asString(form.get("job_slug"));
  const jobTitle = asString(form.get("job_title"));
  const name = asString(form.get("name"));
  const email = asString(form.get("email"));
  const phone = asString(form.get("phone"));
  const message = asString(form.get("message"));

  const cv = form.get("cv");

  if (!jobSlug || !jobTitle) {
    return NextResponse.json({ ok: false, error: "Missing job details." }, { status: 400 });
  }
  if (name.length < 2) {
    return NextResponse.json({ ok: false, error: "Please enter your full name." }, { status: 400 });
  }
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "Please enter a valid email." }, { status: 400 });
  }

  const bucket = process.env.SUPABASE_CAREER_CV_BUCKET || "career-cvs";

  let cv_path: string | null = null;
  let cv_filename: string | null = null;
  let cv_content_type: string | null = null;

  if (cv && typeof cv !== "string") {
    const file = cv as File;
    const maxBytes = 8 * 1024 * 1024;

    if (!file.size || file.size > maxBytes) {
      return NextResponse.json(
        { ok: false, error: "CV must be less than 8MB." },
        { status: 400 }
      );
    }

    const allowedTypes = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    if (file.type && !allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { ok: false, error: "CV must be a PDF or Word document." },
        { status: 400 }
      );
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
    const safeExt = ext ? String(ext).toLowerCase().replace(/[^a-z0-9]/g, "") : "";

    const id = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const datePrefix = new Date().toISOString().slice(0, 10);

    const path = `${datePrefix}/${jobSlug}/${id}${safeExt ? "." + safeExt : ""}`;

    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: file.type || undefined,
      upsert: false
    });

    if (uploadError) {
      return NextResponse.json(
        { ok: false, error: "We could not upload your CV. Please try again." },
        { status: 500 }
      );
    }

    cv_path = path;
    cv_filename = file.name || null;
    cv_content_type = file.type || null;
  }

  const { error: insertError } = await supabase.from("career_applications").insert([
    {
      job_slug: jobSlug,
      job_title: jobTitle,
      applicant_name: name,
      applicant_email: email,
      applicant_phone: phone || null,
      message: message || null,
      cv_path,
      cv_filename,
      cv_content_type,
      status: "new"
    }
  ]);

  if (insertError) {
    return NextResponse.json(
      { ok: false, error: "We could not submit your application right now. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
