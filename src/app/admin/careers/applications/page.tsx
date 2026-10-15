import Link from "next/link";
import { ExternalLink, FileCheck2, Inbox } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";

const statusTones: Record<string, BadgeTone> = {
  new: "blue",
  submitted: "gold",
  reviewing: "gold",
  shortlisted: "violet",
  interview: "violet",
  hired: "green",
  accepted: "green",
  rejected: "red",
  withdrawn: "slate"
};

function fmtDateTime(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos"
  });
}

export default async function AdminCareerApplicationsPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Careers" title="Career applications" />
        <Alert tone="warning">Supabase is not configured.</Alert>
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
      <div className="space-y-6">
        <PageHeader eyebrow="Careers" title="Career applications" />
        <Alert tone="danger">Could not load applications.</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/careers", label: "Job listings" }}
        eyebrow="Careers"
        title="Applications"
        description="Review applicants and download CVs."
        actions={
          <ButtonLink href="/careers" variant="secondary">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            Open /careers
          </ButtonLink>
        }
      />

      <Card>
        <CardHeader title="All applications" description={`${data?.length ?? 0} shown (latest 200)`} />
        {data?.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[980px]">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Role</th>
                  <th>Applicant</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>CV</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => {
                  const status = String(row.status ?? "");
                  return (
                    <tr key={row.id}>
                      <td className="whitespace-nowrap text-slate-500">{fmtDateTime(row.created_at)}</td>
                      <td className="font-semibold text-slate-900">{row.job_title ?? row.job_slug ?? "—"}</td>
                      <td>
                        <Link href={`/admin/careers/applications/${row.id}`} className="gf-link">
                          {row.applicant_name}
                        </Link>
                      </td>
                      <td>{row.applicant_email}</td>
                      <td className="whitespace-nowrap">{row.applicant_phone ?? "—"}</td>
                      <td>
                        {row.cv_path ? (
                          <span className="inline-flex items-center gap-1 text-brand-green-700">
                            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
                            Yes
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <Badge tone={statusTones[status.toLowerCase()] ?? "slate"} className="capitalize">
                          {status}
                        </Badge>
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/admin/careers/applications/${row.id}`}
                          className={buttonClasses({ variant: "secondary", size: "sm" })}
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState icon={Inbox} title="No applications yet" description="Applications submitted on the careers page will show up here." />
        )}
      </Card>
    </div>
  );
}
