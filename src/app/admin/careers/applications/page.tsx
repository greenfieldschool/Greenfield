import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminCareerApplicationsPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <div className="text-sm font-semibold text-slate-900">Career applications</div>
        <p className="mt-2 text-sm text-slate-600">Supabase is not configured.</p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("career_applications")
    .select("id,job_title,job_slug,applicant_name,applicant_email,applicant_phone,status,created_at,cv_path")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <div className="text-sm font-semibold text-slate-900">Career applications</div>
        <p className="mt-2 text-sm text-slate-600">Could not load applications.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Careers</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Applications</h1>
            <p className="mt-2 text-sm text-slate-600">Review applicants and download CVs.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/careers"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Open /careers
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-3 py-3">Applicant</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3">CV</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {data?.length ? (
                data.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 text-slate-700">
                      {new Date(row.created_at as string).toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-slate-900 font-semibold">{row.job_title ?? row.job_slug ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-900 font-semibold">{row.applicant_name}</td>
                    <td className="px-3 py-3 text-slate-700">{row.applicant_email}</td>
                    <td className="px-3 py-3 text-slate-700">{row.applicant_phone ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-700">{row.cv_path ? "Yes" : "—"}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/careers/applications/${row.id}`}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-8 text-sm text-slate-600" colSpan={8}>
                    No applications yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
