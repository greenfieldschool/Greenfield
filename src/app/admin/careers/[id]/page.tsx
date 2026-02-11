import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";

function asText(v: FormDataEntryValue | null) {
  return typeof v === "string" ? v.trim() : "";
}

function asLines(v: FormDataEntryValue | null) {
  const text = asText(v);
  if (!text) return [] as string[];
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

type Props = {
  params: { id: string };
};

export default async function AdminCareerJobEditPage({ params }: Props) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <div className="text-sm font-semibold text-slate-900">Careers</div>
        <p className="mt-2 text-sm text-slate-600">Supabase is not configured.</p>
      </div>
    );
  }

  const isNew = params.id === "new";

  const { data: job } = isNew
    ? ({ data: null } as const)
    : await supabase.from("career_jobs").select("*").eq("id", params.id).maybeSingle();

  async function save(formData: FormData) {
    "use server";

    const supabaseAction = getSupabaseServerClient();
    if (!supabaseAction) return;

    const payload = {
      slug: asText(formData.get("slug")),
      title: asText(formData.get("title")),
      location: asText(formData.get("location")),
      employment_type: asText(formData.get("employment_type")),
      summary: asText(formData.get("summary")),
      responsibilities: asLines(formData.get("responsibilities")),
      requirements: asLines(formData.get("requirements")),
      reports_to: asText(formData.get("reports_to")) || null,
      compensation: asText(formData.get("compensation")) || null,
      apply_email: asText(formData.get("apply_email")) || null,
      apply_whatsapp: asText(formData.get("apply_whatsapp")) || null,
      apply_link: asText(formData.get("apply_link")) || null,
      published: formData.get("published") === "on"
    };

    if (!payload.slug || !payload.title || !payload.location || !payload.employment_type || !payload.summary) {
      redirect(`/admin/careers/${params.id}?error=missing_fields`);
    }

    if (params.id === "new") {
      const { data, error } = await supabaseAction
        .from("career_jobs")
        .insert([payload])
        .select("id")
        .maybeSingle();

      if (error || !data?.id) {
        redirect(`/admin/careers/new?error=save_failed`);
      }

      redirect(`/admin/careers/${data.id}`);
    }

    await supabaseAction.from("career_jobs").update(payload).eq("id", params.id);

    redirect(`/admin/careers/${params.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Careers</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">
              {isNew ? "New job" : job?.title ?? "Edit job"}
            </h1>
            <p className="mt-2 text-sm text-slate-600">Update the job details and publish when ready.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/careers"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Back
            </Link>
            {!isNew && job?.published && job?.slug ? (
              <Link
                href={`/careers/${job.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                View
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <form action={save} className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-900">Title</label>
              <input
                name="title"
                defaultValue={String(job?.title ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                placeholder="e.g. Primary Class Teacher"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Slug</label>
              <input
                name="slug"
                defaultValue={String(job?.slug ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                placeholder="e.g. primary-class-teacher"
              />
              <div className="mt-1 text-xs text-slate-500">Used in the URL: /careers/slug</div>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Location</label>
              <input
                name="location"
                defaultValue={String(job?.location ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                placeholder="e.g. Aba, Abia State"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Employment type</label>
              <input
                name="employment_type"
                defaultValue={String(job?.employment_type ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                placeholder="e.g. Full-time"
              />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Summary</label>
            <textarea
              name="summary"
              defaultValue={String(job?.summary ?? "")}
              className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="1–3 sentences. What is this role and why should a great candidate apply?"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-900">Responsibilities (one per line)</label>
              <textarea
                name="responsibilities"
                defaultValue={Array.isArray(job?.responsibilities) ? (job?.responsibilities as string[]).join("\n") : ""}
                className="mt-1 min-h-[160px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Requirements (one per line)</label>
              <textarea
                name="requirements"
                defaultValue={Array.isArray(job?.requirements) ? (job?.requirements as string[]).join("\n") : ""}
                className="mt-1 min-h-[160px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-900">Reports to (optional)</label>
              <input
                name="reports_to"
                defaultValue={String(job?.reports_to ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Compensation (optional)</label>
              <input
                name="compensation"
                defaultValue={String(job?.compensation ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-slate-900">Apply email (optional)</label>
              <input
                name="apply_email"
                defaultValue={String(job?.apply_email ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                placeholder="e.g. hr@greenfieldschool.ng"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Apply WhatsApp (optional)</label>
              <input
                name="apply_whatsapp"
                defaultValue={String(job?.apply_whatsapp ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                placeholder="e.g. https://wa.me/234..."
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Apply link (optional)</label>
              <input
                name="apply_link"
                defaultValue={String(job?.apply_link ?? "")}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                placeholder="e.g. Google Form URL"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <label className="flex items-center gap-3 text-sm font-semibold text-slate-900">
              <input
                type="checkbox"
                name="published"
                defaultChecked={Boolean(job?.published)}
                className="h-4 w-4 rounded border-slate-300"
              />
              Published
            </label>
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 sm:w-auto"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
