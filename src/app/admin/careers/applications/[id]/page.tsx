import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import SubmitButton from "@/components/submit-button";
import { Download, MessageCircle, SearchX } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";

const statusTones: Record<string, BadgeTone> = {
  new: "blue",
  reviewing: "gold",
  shortlisted: "violet",
  interview: "violet",
  hired: "green",
  rejected: "red"
};

function field(label: string, value: unknown) {
  const text = typeof value === "string" && value.trim() ? value.trim() : value ? String(value) : "—";
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm font-semibold text-slate-900">{text}</dd>
    </div>
  );
}

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

export default async function AdminCareerApplicationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();

  if (!supabase) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: "/admin/careers/applications", label: "Back" }} eyebrow="Careers" title="Career application" />
        <Alert tone="warning">Supabase is not configured.</Alert>
      </div>
    );
  }

  const { data: row } = await supabase.from("career_applications").select("*").eq("id", id).maybeSingle();

  if (!row) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: "/admin/careers/applications", label: "Back" }} eyebrow="Career application" title="Application not found" />
        <Card>
          <EmptyState
            icon={SearchX}
            title="Application not found"
            description="It may have been removed."
            action={
              <ButtonLink href="/admin/careers/applications" variant="secondary" size="sm">
                Back to applications
              </ButtonLink>
            }
          />
        </Card>
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

    await supabaseAction.from("career_applications").update({ status: nextStatus }).eq("id", id);

    redirect(`/admin/careers/applications/${id}`);
  }

  const status = String(row.status ?? "");

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ href: "/admin/careers/applications", label: "Back" }}
        eyebrow="Career application"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {row.applicant_name}
            {status ? (
              <Badge tone={statusTones[status.toLowerCase()] ?? "slate"} className="capitalize">
                {status}
              </Badge>
            ) : null}
          </span>
        }
        description={
          <>
            Role: <span className="font-semibold text-slate-900">{row.job_title ?? row.job_slug ?? "—"}</span>
            <span className="mx-2 text-slate-300">·</span>
            Submitted {fmtDateTime(row.created_at)}
          </>
        }
        actions={
          <>
            {row.cv_path ? (
              <form action={downloadCv}>
                <SubmitButton variant="secondary" pendingText="Preparing…" showSpinner={false}>
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download CV
                </SubmitButton>
              </form>
            ) : null}
            {row.applicant_phone ? (
              <a
                href={`https://wa.me/${String(row.applicant_phone).replace(/\D/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className={buttonClasses({ className: "bg-[#25D366] hover:bg-[#1fb857]" })}
              >
                <MessageCircle className="h-4 w-4" aria-hidden="true" />
                WhatsApp
              </a>
            ) : null}
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Applicant details" />
            <CardBody>
              <dl className="grid gap-5 sm:grid-cols-3">
                {field("Status", row.status)}
                {field("Email", row.applicant_email)}
                {field("Phone", row.applicant_phone)}
                {field("CV filename", row.cv_filename)}
                {field("CV content type", row.cv_content_type)}
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Message" />
            <CardBody>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{String(row.message ?? "—")}</div>
            </CardBody>
          </Card>
        </div>

        <form action={updateStatus}>
          <Card>
            <CardHeader title="Update status" description="Track where this applicant is in the hiring process." />
            <CardBody>
              <label htmlFor="status" className="gf-label">
                Status
              </label>
              <select id="status" name="status" defaultValue={String(row.status ?? "new")} className="gf-select">
                <option value="new">New</option>
                <option value="reviewing">Reviewing</option>
                <option value="shortlisted">Shortlisted</option>
                <option value="interview">Interview</option>
                <option value="hired">Hired</option>
                <option value="rejected">Rejected</option>
              </select>
            </CardBody>
            <div className="flex justify-end rounded-b-2xl border-t border-slate-100 bg-slate-50/60 px-5 py-3.5 sm:px-6">
              <SubmitButton variant="primary" pendingText="Saving…">
                Save
              </SubmitButton>
            </div>
          </Card>
        </form>
      </div>
    </div>
  );
}
