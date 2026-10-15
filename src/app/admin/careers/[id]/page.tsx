import { ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AdminCareerJobEditor } from "./ui";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function AdminCareerJobEditPage({ params }: Props) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: "/admin/careers", label: "Back" }} eyebrow="Careers" title="Careers" />
        <Alert tone="warning">Supabase is not configured.</Alert>
      </div>
    );
  }

  const isNew = id === "new";

  const { data: job } = isNew
    ? ({ data: null } as const)
    : await supabase.from("career_jobs").select("*").eq("id", id).maybeSingle();

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
      <PageHeader
        back={{ href: "/admin/careers", label: "Back" }}
        eyebrow="Careers"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {isNew ? "New job" : job?.title ?? "Edit job"}
            {!isNew ? (
              job?.published ? (
                <Badge tone="green" dot>
                  Published
                </Badge>
              ) : (
                <Badge tone="slate">Draft</Badge>
              )
            ) : null}
          </span>
        }
        description="Update the job details and publish when ready."
        actions={
          !isNew && job?.published && job?.slug ? (
            <ButtonLink href={`/careers/${job.slug}`} target="_blank" rel="noreferrer" variant="secondary">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              View
            </ButtonLink>
          ) : null
        }
      />

      <AdminCareerJobEditor id={id} initialJob={initialJob} />
    </div>
  );
}
