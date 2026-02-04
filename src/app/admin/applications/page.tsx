import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type SearchParams = Record<string, string | string[] | undefined>;

function asString(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

export default async function AdminApplicationsPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <div className="text-sm font-semibold text-slate-900">Admissions applications</div>
        <p className="mt-2 text-sm text-slate-600">Supabase is not configured.</p>
      </div>
    );
  }

  const status = asString(searchParams?.status);
  const section = asString(searchParams?.section);

  let query = supabase
    .from("admissions_applications")
    .select("id,status,section,parent_name,phone,email,desired_start,preferred_contact,created_at,updated_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (status) query = query.eq("status", status);
  if (section) query = query.eq("section", section);

  const { data, error } = await query;

  if (error) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8">
        <div className="text-sm font-semibold text-slate-900">Admissions applications</div>
        <p className="mt-2 text-sm text-slate-600">Could not load applications.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-500">Admissions</div>
            <h1 className="mt-2 text-2xl font-semibold text-slate-900">Applications</h1>
            <p className="mt-2 text-sm text-slate-600">
              Review submissions from <code>/apply</code> and track follow-up.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link
              href="/apply"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Open /apply
            </Link>
            <Link
              href="/admin/applications"
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
            >
              Clear filters
            </Link>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 text-sm">
          <Link
            href="/admin/applications?status=lead"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Leads
          </Link>
          <Link
            href="/admin/applications?status=submitted"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Submitted
          </Link>
          <Link
            href="/admin/applications?section=creche"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Creche
          </Link>
          <Link
            href="/admin/applications?section=primary"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Primary
          </Link>
          <Link
            href="/admin/applications?section=secondary"
            className="rounded-full border border-slate-200 bg-white px-3 py-1 font-semibold text-slate-700 hover:bg-slate-50"
          >
            Secondary
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Section</th>
                <th className="px-3 py-3">Parent</th>
                <th className="px-3 py-3">Phone</th>
                <th className="px-3 py-3">Email</th>
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
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">{row.section ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-900 font-semibold">{row.parent_name ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-700">{row.phone ?? "—"}</td>
                    <td className="px-3 py-3 text-slate-700">{row.email ?? "—"}</td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/admin/applications/${row.id}`}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-8 text-sm text-slate-600" colSpan={7}>
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
