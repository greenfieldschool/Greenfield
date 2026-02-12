import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AdminCareerJobEditor } from "./ui";

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

  const initialJob = {
    slug: String(job?.slug ?? ""),
    title: String(job?.title ?? ""),
    location: String(job?.location ?? ""),
    employment_type: String(job?.employment_type ?? ""),
    summary: String(job?.summary ?? ""),
    responsibilities: Array.isArray(job?.responsibilities)
      ? (job?.responsibilities as string[])
      : ([] as string[]),
    requirements: Array.isArray(job?.requirements) ? (job?.requirements as string[]) : ([] as string[]),
    reports_to: (job?.reports_to as string | null | undefined) ?? null,
    compensation: (job?.compensation as string | null | undefined) ?? null,
    apply_email: (job?.apply_email as string | null | undefined) ?? null,
    apply_whatsapp: (job?.apply_whatsapp as string | null | undefined) ?? null,
    apply_link: (job?.apply_link as string | null | undefined) ?? null,
    published: Boolean(job?.published)
  };

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

      <AdminCareerJobEditor id={params.id} initialJob={initialJob} />
    </div>
  );
}
