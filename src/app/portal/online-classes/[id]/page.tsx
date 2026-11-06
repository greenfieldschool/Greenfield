import { ArrowLeft, BookOpenText, Video } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ONLINE_CLASS_COLUMNS, PLATFORM_LABEL, STATE_LABEL, STATE_TONE, classState, startsIn, whenLabel, type OnlineClassRow } from "@/lib/online-classes";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { InfoItem, PortalNotice, PortalPageHeader } from "../../_components/portal-ui";
import { HELP } from "@/lib/portal-help";
import { loadAssignmentsViewer } from "../../assignments/_load";
import { joinOnlineClass } from "../actions";

const ATTENDED: Record<string, string> = { present: "Present", late: "Late", absent: "Absent" };

// One online class: when, what to prepare, the lesson note that goes with it, and Join while it's open.
export default async function PortalOnlineClassPage({
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
  if (viewer.kind === "notice") return <PortalNotice title="Online class" message={viewer.message} />;
  const { role, pupil } = viewer;

  const { data } = await supabase.from("online_classes").select(ONLINE_CLASS_COLUMNS).eq("id", id).maybeSingle();
  const o = data as OnlineClassRow | null;
  if (!o || o.class_id !== pupil.class_id) {
    return <PortalNotice title="Online class" message="This online class isn't for this class, or the teacher has removed it." />;
  }

  const [{ data: subject }, { data: note }, { data: a }] = await Promise.all([
    o.subject_id ? supabase.from("subjects").select("name").eq("id", o.subject_id).maybeSingle() : Promise.resolve({ data: null }),
    // Only a published note comes back (the database hides drafts from parents and pupils).
    o.lesson_note_id ? supabase.from("lesson_notes").select("id, topic").eq("id", o.lesson_note_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("online_class_attendance").select("joined_at, status").eq("online_class_id", o.id).eq("student_id", pupil.id).maybeSingle()
  ]);
  const state = classState(o);
  const child = role === "parent" ? `?student_id=${pupil.id}` : "";
  const listHref = `/portal/online-classes${child}`;
  const lessonNote = note as { id: string; topic: string } | null;
  const attendance = a as { joined_at: string | null; status: string | null } | null;
  const subjectName = (subject as { name: string } | null)?.name ?? "General";

  return (
    <div className="space-y-6">
      <UrlToast />
      <a href={listHref} className="inline-flex min-h-[40px] items-center gap-1.5 text-sm font-semibold text-brand-green-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        All online classes
      </a>
      <PortalPageHeader help={HELP.onlineClasses} eyebrow={subjectName} title={o.topic} description={`${whenLabel(o.starts_at, o.duration_minutes)} · ${PLATFORM_LABEL[o.platform]}`} />

      <Card className={state === "live" || state === "soon" ? "!border-brand-green-300 bg-brand-green-50/40" : state === "cancelled" ? "!border-red-200" : undefined}>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATE_TONE[state]} dot>
              {state === "upcoming" ? `Starts ${startsIn(o.starts_at)}` : STATE_LABEL[state]}
            </Badge>
            {state === "ended" ? (
              <span className="text-sm text-slate-600">
                {attendance?.status ? ATTENDED[attendance.status] : attendance?.joined_at ? "Joined" : "Didn't join"}
                {role === "parent" ? ` · ${pupil.first_name}` : ""}
              </span>
            ) : null}
          </div>
          {state === "cancelled" ? (
            <p className="text-sm text-red-800">This class has been cancelled{o.cancel_reason ? `: ${o.cancel_reason}` : "."}</p>
          ) : state === "live" || state === "soon" ? (
            <form action={joinOnlineClass} className="space-y-2">
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="student_id" value={pupil.id} />
              <input type="hidden" name="back" value={`/portal/online-classes/${o.id}${child}`} />
              <SubmitButton sound="tap" pendingText="Opening…" className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-green px-6 text-base font-semibold text-white shadow-sm transition hover:bg-brand-green-700 disabled:opacity-60 sm:w-auto">
                <span className="inline-flex items-center gap-2">
                  <Video className="h-5 w-5" aria-hidden="true" />
                  Join {role === "parent" ? `for ${pupil.first_name}` : "now"}
                </span>
              </SubmitButton>
              <p className="text-xs text-slate-500">Opens {PLATFORM_LABEL[o.platform]}. Joining marks {role === "parent" ? pupil.first_name : "you"} as there.</p>
            </form>
          ) : state === "upcoming" ? (
            <p className="text-sm text-slate-600">The Join button appears here 15 minutes before the start. Come back then.</p>
          ) : (
            <p className="text-sm text-slate-600">This class has ended.</p>
          )}
          {o.meeting_code && state !== "cancelled" && state !== "ended" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <InfoItem label="Passcode">{o.meeting_code}</InfoItem>
              <InfoItem label="How long">{o.duration_minutes} minutes</InfoItem>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {o.description ? (
        <Card>
          <CardHeader title="What to prepare" />
          <CardBody>
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-800">{o.description}</p>
          </CardBody>
        </Card>
      ) : null}

      {lessonNote ? (
        <a
          href={`/portal/lesson-notes/${lessonNote.id}${child}`}
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-green-200 hover:bg-brand-green-50/40"
        >
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-700">
            <BookOpenText className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Lesson note</span>
            <span className="block font-semibold text-slate-900">{lessonNote.topic}</span>
          </span>
        </a>
      ) : null}

      {o.author_name ? <p className="text-sm text-slate-500">Teacher: {o.author_name}</p> : null}
    </div>
  );
}
