import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";

function field(label: string, value: unknown) {
  const text = typeof value === "string" && value.trim() ? value.trim() : value ? String(value) : "—";
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-sm font-semibold text-slate-900 break-words">{text}</div>
    </div>
  );
}

export default async function AdminCareerApplicationDetailPage({ params }: { params: { id: string } }) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <div className="text-sm font-semibold text-slate-900">Career application</div>
        <p className="mt-2 text-sm text-slate-600">Supabase is not configured.</p>
      </div>
    );
  }

  const { data: row } = await supabase.from("career_applications").select("*").eq("id", params.id).maybeSingle();

  if (!row) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <div className="text-sm font-semibold text-slate-900">Application not found</div>
        <div className="mt-4">
          <Link
            href="/admin/careers/applications"
            className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
          >
            Back
          </Link>
        </div>
      </div>
    );
  }

  async function downloadCv() {
    "use server";

    const path = String(row.cv_path ?? "").trim();
    if (!path) return;

    const svc = getSupabaseServiceClient();
    if (!svc) return;

    const bucket = process.env.SUPABASE_CAREER_CV_BUCKET || "career-cvs";
    const { data } = await svc.storage.from(bucket).createSignedUrl(path, 60);

    if (!data?.signedUrl) return;

    redirect(data.signedUrl);
  }

  async function updateStatus(formData: FormData) {
    "use server";

    const nextStatus = String(formData.get("status") ?? "").trim();
    if (!nextStatus) return;

    const supabaseAction = getSupabaseServerClient();
    if (!supabaseAction) return;

    await supabaseAction.from("career_applications").update({ status: nextStatus }).eq("id", params.id);

    redirect(`/admin/careers/applications/${params.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Career application</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">{row.applicant_name}</h1>
            <p className="mt-2 text-sm text-slate-600">
              Role: <span className="font-semibold text-slate-900">{row.job_title ?? row.job_slug ?? "—"}</span>
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Submitted {new Date(row.created_at as string).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/careers/applications"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Back
            </Link>
            {row.applicant_phone ? (
              <a
                href={`https://wa.me/${String(row.applicant_phone).replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {field("Status", row.status)}
          {field("Email", row.applicant_email)}
          {field("Phone", row.applicant_phone)}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {field("CV filename", row.cv_filename)}
          {field("CV content type", row.cv_content_type)}
        </div>

        <div className="mt-6 grid gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Message</div>
            <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{String(row.message ?? "—")}</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-end gap-3">
          <form action={updateStatus} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-sm font-semibold text-slate-900">Update status</label>
              <select
                name="status"
                defaultValue={String(row.status ?? "new")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              >
                <option value="new">new</option>
                <option value="reviewing">reviewing</option>
                <option value="shortlisted">shortlisted</option>
                <option value="interview">interview</option>
                <option value="hired">hired</option>
                <option value="rejected">rejected</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
            >
              Save
            </button>
          </form>

          {row.cv_path ? (
            <form action={downloadCv}>
              <button
                type="submit"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Download CV
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
