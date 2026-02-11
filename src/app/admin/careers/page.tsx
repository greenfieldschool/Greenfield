import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminCareersPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <div className="text-sm font-semibold text-slate-900">Careers</div>
        <p className="mt-2 text-sm text-slate-600">Supabase is not configured.</p>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from("career_jobs")
    .select("id, slug, title, location, employment_type, published, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Admin</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Careers</h1>
            <p className="mt-2 text-sm text-slate-600">Create, update, and publish job listings.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/admin/careers/new"
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
            >
              New job
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="text-sm font-semibold text-slate-900">Job listings</div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="py-3 pr-4">Title</th>
                <th className="py-3 pr-4">Slug</th>
                <th className="py-3 pr-4">Location</th>
                <th className="py-3 pr-4">Type</th>
                <th className="py-3 pr-4">Status</th>
                <th className="py-3 pr-4">Updated</th>
                <th className="py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(rows ?? []).map((job) => (
                <tr key={job.id} className="border-b border-slate-100">
                  <td className="py-4 pr-4 font-semibold text-slate-900">{job.title}</td>
                  <td className="py-4 pr-4 text-slate-600">{job.slug}</td>
                  <td className="py-4 pr-4 text-slate-600">{job.location}</td>
                  <td className="py-4 pr-4 text-slate-600">{job.employment_type}</td>
                  <td className="py-4 pr-4">
                    {job.published ? (
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                        Published
                      </span>
                    ) : (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="py-4 pr-4 text-slate-600">
                    {job.updated_at ? new Date(String(job.updated_at)).toLocaleString() : "—"}
                  </td>
                  <td className="py-4">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/admin/careers/${job.id}`}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        Edit
                      </Link>
                      {job.published ? (
                        <Link
                          href={`/careers/${job.slug}`}
                          className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                          target="_blank"
                          rel="noreferrer"
                        >
                          View
                        </Link>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {(rows ?? []).length === 0 ? (
                <tr>
                  <td className="py-6 text-slate-600" colSpan={7}>
                    No jobs yet. Click “New job” to create one.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
