import Link from "next/link";
import { ExternalLink, FilterX, Inbox, Plus } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { ApplicationStatusBadge, formatDateTime, humanize } from "./_ui";

type SearchParams = Record<string, string | string[] | undefined>;

function asString(v: string | string[] | undefined) {
  return typeof v === "string" ? v : "";
}

const statusFilters = [
  { key: "lead", label: "Leads", href: "/admin/students/applications?status=lead" },
  { key: "submitted", label: "Submitted", href: "/admin/students/applications?status=submitted" }
];

const sectionFilters = [
  { key: "creche", label: "Creche", href: "/admin/students/applications?section=creche" },
  { key: "primary", label: "Primary", href: "/admin/students/applications?section=primary" },
  { key: "secondary", label: "Secondary", href: "/admin/students/applications?section=secondary" }
];

function FilterChip({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition",
        active
          ? "border-brand-green bg-brand-green text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
      )}
    >
      {label}
    </Link>
  );
}

export default async function AdminApplicationsPage({
  searchParams
}: {
  searchParams?: SearchParams;
}) {
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Admissions" title="Applications" />
        <Alert tone="warning" title="Supabase is not configured.">
          Applications can&apos;t be loaded until the database connection is set up.
        </Alert>
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

  const createError = asString(searchParams?.create_error);
  const isFiltered = Boolean(status || section);

  const headerActions = (
    <>
      <ButtonLink href="/apply" variant="secondary">
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
        Open /apply
      </ButtonLink>
      <ButtonLink href="/admin/students/applications/new">
        <Plus className="h-4 w-4" aria-hidden="true" />
        New application
      </ButtonLink>
    </>
  );

  const header = (
    <PageHeader
      eyebrow="Admissions"
      title="Applications"
      description={
        <>
          Review submissions from <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">/apply</code> and track
          follow-up.
        </>
      }
      actions={headerActions}
    />
  );

  if (error) {
    return (
      <div className="space-y-6">
        {header}
        <Alert tone="danger" title="Could not load applications.">
          Please refresh the page or try again in a moment.
        </Alert>
      </div>
    );
  }

  const rows = data ?? [];

  return (
    <div className="space-y-6">
      {header}

      {createError ? (
        <Alert tone="danger" title="The application could not be created.">
          Please check the details and try again.
        </Alert>
      ) : null}

      <Card>
        <CardBody className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Status</span>
              {statusFilters.map((f) => (
                <FilterChip key={f.key} href={f.href} label={f.label} active={status === f.key} />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Section</span>
              {sectionFilters.map((f) => (
                <FilterChip key={f.key} href={f.href} label={f.label} active={section === f.key} />
              ))}
            </div>
          </div>
          <ButtonLink href="/admin/students/applications" variant="ghost" size="sm" className="self-start lg:self-auto">
            <FilterX className="h-4 w-4" aria-hidden="true" />
            Clear filters
          </ButtonLink>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="All applications"
          description={
            isFiltered
              ? `${rows.length} matching application${rows.length === 1 ? "" : "s"}`
              : `${rows.length} most recent application${rows.length === 1 ? "" : "s"}`
          }
        />
        {rows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[860px]">
              <thead>
                <tr>
                  <th>Created</th>
                  <th>Status</th>
                  <th>Section</th>
                  <th>Parent</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th className="text-right">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-slate-600">{formatDateTime(row.created_at)}</td>
                    <td>
                      <ApplicationStatusBadge status={row.status as string | null} />
                    </td>
                    <td>{row.section ? humanize(String(row.section)) : "—"}</td>
                    <td className="font-semibold text-slate-900">{row.parent_name ?? "—"}</td>
                    <td className="whitespace-nowrap">{row.phone ?? "—"}</td>
                    <td className="max-w-[220px] truncate">{row.email ?? "—"}</td>
                    <td className="text-right">
                      <ButtonLink href={`/admin/students/applications/${row.id}`} variant="secondary" size="sm">
                        View
                      </ButtonLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Inbox}
            title={isFiltered ? "No applications match this filter" : "No applications yet"}
            description={
              isFiltered
                ? "Try a different filter or clear filters to see everything."
                : "Applications submitted on /apply or created here will appear in this list."
            }
            action={
              isFiltered ? (
                <ButtonLink href="/admin/students/applications" variant="secondary" size="sm">
                  Clear filters
                </ButtonLink>
              ) : (
                <ButtonLink href="/admin/students/applications/new" size="sm">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  New application
                </ButtonLink>
              )
            }
          />
        )}
      </Card>
    </div>
  );
}
