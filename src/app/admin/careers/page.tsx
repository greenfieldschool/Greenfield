import Link from "next/link";
import { Briefcase, ExternalLink, Inbox, Pencil, Plus } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";

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

export default async function AdminCareersPage() {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Admin" title="Careers" />
        <Alert tone="warning">Supabase is not configured.</Alert>
      </div>
    );
  }

  const { data: rows } = await supabase
    .from("career_jobs")
    .select("id, slug, title, location, employment_type, published, updated_at")
    .order("updated_at", { ascending: false });

  const jobs = rows ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Admin"
        title="Careers"
        description="Create, update, and publish job listings."
        actions={
          <>
            <ButtonLink href="/admin/careers/applications" variant="secondary">
              <Inbox className="h-4 w-4" aria-hidden="true" />
              Applications
            </ButtonLink>
            <ButtonLink href="/admin/careers/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New job
            </ButtonLink>
          </>
        }
      />

      <Card>
        <CardHeader title="Job listings" description={`${jobs.length} job${jobs.length === 1 ? "" : "s"}`} />
        {jobs.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[820px]">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Slug</th>
                  <th>Location</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td>
                      <Link href={`/admin/careers/${job.id}`} className="gf-link">
                        {job.title}
                      </Link>
                    </td>
                    <td className="font-mono text-xs text-slate-500">{job.slug}</td>
                    <td>{job.location}</td>
                    <td>{job.employment_type}</td>
                    <td>
                      {job.published ? (
                        <Badge tone="green" dot>
                          Published
                        </Badge>
                      ) : (
                        <Badge tone="slate">Draft</Badge>
                      )}
                    </td>
                    <td className="whitespace-nowrap text-slate-500">{fmtDateTime(job.updated_at)}</td>
                    <td>
                      <div className="flex justify-end gap-2">
                        <Link href={`/admin/careers/${job.id}`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Edit
                        </Link>
                        {job.published ? (
                          <Link
                            href={`/careers/${job.slug}`}
                            className={buttonClasses({ variant: "ghost", size: "sm" })}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" aria-hidden="true" />
                            View
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Briefcase}
            title="No jobs yet"
            description="Click “New job” to create one."
            action={
              <ButtonLink href="/admin/careers/new" size="sm">
                New job
              </ButtonLink>
            }
          />
        )}
      </Card>
    </div>
  );
}
