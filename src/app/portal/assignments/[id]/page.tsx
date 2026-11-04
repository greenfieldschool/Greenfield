import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ArrowLeft, MessageSquareText, Paperclip, Send } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  ASSIGNMENT_COLUMNS,
  KIND_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  SUBMISSION_COLUMNS,
  assignmentErrorMessage,
  dueLabel,
  pupilStatus,
  signedFileLinks,
  type AssignmentRow,
  type SubmissionRow
} from "@/lib/assignments";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { AssignmentFilePicker } from "@/components/assignment-file-picker";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { PortalNotice, PortalPageHeader } from "../../_components/portal-ui";
import { HELP } from "@/lib/portal-help";
import { loadAssignmentsViewer } from "../_load";

function back(id: string, message: string, type: "success" | "error" = "success"): never {
  redirect(`/portal/assignments/${id}?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

// The pupil hands in (or changes) their work. The database checks it's theirs, for their class, not marked yet and
// not too late (submit_assignment).
async function handIn(formData: FormData) {
  "use server";
  const id = String(formData.get("assignment_id") ?? "").trim();
  const body = String(formData.get("body") ?? "");
  const filePath = String(formData.get("file_path") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error");
  const { error } = await supabase.rpc("submit_assignment", {
    p_assignment: id,
    p_body: body,
    p_file_path: filePath || null,
    p_file_name: String(formData.get("file_name") ?? "").trim() || null,
    p_file_type: String(formData.get("file_type") ?? "").trim() || null
  });
  if (error) back(id, assignmentErrorMessage(error.message), "error");
  revalidatePath(`/portal/assignments/${id}`);
  revalidatePath("/portal/assignments");
  revalidatePath(`/admin/academics/assignments/${id}`);
  back(id, "Handed in. Your teacher can see it now.");
}

export default async function PortalAssignmentPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const viewer = await loadAssignmentsViewer(supabase, sp);
  if (viewer.kind === "notice") return <PortalNotice title="Assignment" message={viewer.message} />;
  const { role, pupil } = viewer;

  const { data: aData } = await supabase.from("assignments").select(ASSIGNMENT_COLUMNS).eq("id", id).maybeSingle();
  const a = aData as AssignmentRow | null;
  const listHref = role === "parent" ? `/portal/assignments?student_id=${pupil.id}` : "/portal/assignments";
  if (!a || a.class_id !== pupil.class_id) {
    return <PortalNotice title="Assignment" message="This assignment isn't for this class, or it has been removed." />;
  }

  const [{ data: sData }, { data: subject }] = await Promise.all([
    supabase.from("assignment_submissions").select(SUBMISSION_COLUMNS).eq("assignment_id", id).eq("student_id", pupil.id).maybeSingle(),
    a.subject_id ? supabase.from("subjects").select("name").eq("id", a.subject_id).maybeSingle() : Promise.resolve({ data: null })
  ]);
  const s = sData as SubmissionRow | null;
  const links = await signedFileLinks(supabase, [a.attachment_path, s?.file_path]);
  const status = pupilStatus(a, s);
  const pastDue = Boolean(a.due_at && new Date() > new Date(a.due_at));
  const canHandIn = role === "student" && !s?.marked_at && (!pastDue || a.accepts_late);
  const workUrl = s?.file_path ? links.get(s.file_path) ?? null : null;
  const subjectName = (subject as { name: string } | null)?.name ?? "General";

  return (
    <div className="space-y-6">
      <UrlToast />
      <a href={listHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All assignments
      </a>
      <PortalPageHeader help={HELP.assignments} title={a.title} description={`${KIND_LABEL[a.kind]} · ${subjectName} · ${dueLabel(a.due_at)}${a.max_score ? ` · out of ${Number(a.max_score)}` : ""}`} />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={STATUS_TONE[status]} dot>
          {STATUS_LABEL[status]}
        </Badge>
        {role === "parent" ? <span className="text-sm text-slate-500">for {pupil.first_name}</span> : null}
      </div>

      {s?.marked_at ? (
        <Card className="border-brand-green-200 bg-brand-green-50/40">
          <CardBody className="flex items-start gap-4">
            <div className="shrink-0 rounded-2xl bg-white px-4 py-3 text-center ring-1 ring-brand-green-200">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Mark</div>
              <div className="text-2xl font-bold tabular-nums text-brand-green-900">
                {s.score === null ? "—" : Number(s.score)}
                {a.max_score && s.score !== null ? <span className="text-sm font-medium text-slate-400">/{Number(a.max_score)}</span> : null}
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">
                <MessageSquareText className="h-4 w-4 text-brand-green-700" aria-hidden="true" />
                Teacher&apos;s comment
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{s.feedback || "No comment."}</p>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="What to do" />
        <CardBody className="space-y-4">
          {a.instructions ? <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{a.instructions}</p> : <p className="text-sm text-slate-500">No written instructions.</p>}
          {a.attachment_path && links.get(a.attachment_path) ? (
            <a href={links.get(a.attachment_path)} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary" })}>
              <Paperclip className="h-4 w-4" aria-hidden="true" />
              {a.attachment_name ?? "Open the worksheet"}
            </a>
          ) : null}
        </CardBody>
      </Card>

      {role === "student" ? (
        canHandIn ? (
          <Card>
            <CardHeader
              title={s?.submitted_at ? "Your work (you can still change it)" : "Hand in your work"}
              description={
                pastDue
                  ? "The due date has passed. You can still hand in, but it will show as late."
                  : "Type your answer, add a photo or file of your work, or both. You can change it until your teacher marks it."
              }
            />
            <form action={handIn} className="space-y-4 px-5 pb-5 sm:px-6">
              <input type="hidden" name="assignment_id" value={a.id} />
              <div>
                <label htmlFor="hand-in-body" className="gf-label">
                  Your answer
                </label>
                <textarea id="hand-in-body" name="body" rows={6} maxLength={20000} defaultValue={s?.body ?? ""} className="gf-input" placeholder="Type your answer here (optional if you add a photo)." />
              </div>
              <div>
                <span className="gf-label">Photo or file</span>
                <AssignmentFilePicker
                  folder={`work/${a.id}/${pupil.id}`}
                  label="Add a photo or file"
                  current={s?.file_path ? { path: s.file_path, name: s.file_name, type: s.file_type, url: workUrl } : null}
                />
              </div>
              <SubmitButton pendingText="Handing in…">
                <span className="inline-flex items-center gap-2">
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {s?.submitted_at ? "Hand in again" : "Hand in"}
                </span>
              </SubmitButton>
            </form>
          </Card>
        ) : !s?.marked_at ? (
          <Alert tone="warning">The due date has passed and your teacher isn&apos;t accepting late work for this one. Speak to your teacher.</Alert>
        ) : null
      ) : null}

      {(role === "parent" || s?.marked_at) && (s?.body || workUrl) ? (
        <Card>
          <CardHeader title={role === "parent" ? `${pupil.first_name}'s work` : "What you handed in"} />
          <CardBody className="space-y-3">
            {s?.body ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{s.body}</p> : null}
            {workUrl ? (
              (s?.file_type ?? "").startsWith("image/") ? (
                <a href={workUrl} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={workUrl} alt="The work handed in" className="max-h-80 rounded-xl ring-1 ring-slate-200" />
                </a>
              ) : (
                <a href={workUrl} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "secondary" })}>
                  <Paperclip className="h-4 w-4" aria-hidden="true" />
                  {s?.file_name ?? "Open the file"}
                </a>
              )
            ) : null}
          </CardBody>
        </Card>
      ) : role === "parent" && !s?.submitted_at ? (
        <p className="text-sm text-slate-500">{pupil.first_name} hasn&apos;t handed this in on the portal yet. Work handed in on paper shows here once it&apos;s marked.</p>
      ) : null}
    </div>
  );
}
