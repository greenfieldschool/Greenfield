import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Ban, ExternalLink, RotateCcw, Save, Trash2, Users, Video } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canTeach, getTeacherAccess } from "@/lib/teacher-access";
import { firstOrNull } from "@/lib/relations";
import { lagosDateTimeParts, lagosDueAt } from "@/lib/assignments";
import {
  DURATIONS,
  ONLINE_CLASS_COLUMNS,
  PLATFORM_LABEL,
  STATE_LABEL,
  STATE_TONE,
  classState,
  cleanMeetingUrl,
  onlineClassErrorMessage,
  platformFromUrl,
  whenLabel,
  type OnlineClassRow
} from "@/lib/online-classes";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { LEARN } from "@/lib/learn-guides";
import { cn } from "@/lib/cn";

const LIST = "/admin/academics/online-classes";

type Status = "present" | "late" | "absent";
const STATUS_LABEL: Record<Status, string> = { present: "Present", late: "Late", absent: "Absent" };

function back(id: string, message: string, type: "success" | "error" = "success", hash = ""): never {
  redirect(`${LIST}/${id}?toast=${encodeURIComponent(message)}&toast_type=${type}${hash}`);
}

async function saveDetails(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const subjectRaw = String(formData.get("subject_id") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim().replace(/\s+/g, " ");
  const description = String(formData.get("description") ?? "").trim();
  const startsAt = lagosDueAt(String(formData.get("date") ?? ""), String(formData.get("time") ?? ""));
  const duration = Number(formData.get("duration") ?? 40);
  const url = cleanMeetingUrl(String(formData.get("meeting_url") ?? ""));
  const code = String(formData.get("meeting_code") ?? "").trim();
  const noteId = String(formData.get("lesson_note_id") ?? "").trim();
  const previousStart = String(formData.get("previous_start") ?? "");
  if (!subjectRaw) back(id, "Choose the subject", "error");
  if (topic.length < 2) back(id, "Give the topic", "error");
  if (!startsAt) back(id, "Choose the date and start time", "error");
  if (!Number.isInteger(duration) || duration < 5 || duration > 300) back(id, "Choose how long the class lasts", "error");
  if (!url) back(id, "Paste the full meeting link from Zoom, Google Meet or Teams (it starts with https://)", "error");
  const moved = previousStart && new Date(previousStart).getTime() !== new Date(startsAt).getTime();
  if (moved && new Date(startsAt).getTime() < Date.now() - 5 * 60000) back(id, "That time has already passed. Choose a time from now on.", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("online_classes")
    .update({
      subject_id: subjectRaw === "none" ? null : subjectRaw,
      topic,
      description: description || null,
      starts_at: startsAt,
      duration_minutes: duration,
      platform: platformFromUrl(url),
      meeting_url: url,
      meeting_code: code || null,
      lesson_note_id: noteId || null,
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString()
    })
    .eq("id", id)
    .select("id");
  if (error) back(id, onlineClassErrorMessage(error.message), "error");
  if (!data?.length) back(id, "Only the teacher of this class and subject (or an admin) can change this.", "error");
  revalidatePath(LIST);
  revalidatePath(`${LIST}/${id}`);
  revalidatePath("/portal/online-classes");
  back(id, moved ? "Rescheduled. Pupils and parents see the new time." : "Saved");
}

async function cancelClass(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) back(id, "Give a short reason; pupils and parents see it.", "error");
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error");
  const { data, error } = await supabase
    .from("online_classes")
    .update({ status: "cancelled", cancel_reason: reason.slice(0, 500), updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) back(id, onlineClassErrorMessage(error.message), "error");
  if (!data?.length) back(id, "Only the teacher of this class and subject (or an admin) can cancel this.", "error");
  revalidatePath(LIST);
  revalidatePath("/portal/online-classes");
  back(id, "Cancelled. Pupils and parents see that it's cancelled and why.");
}

async function restoreClass(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error");
  const { data, error } = await supabase
    .from("online_classes")
    .update({ status: "scheduled", cancel_reason: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id");
  if (error) back(id, onlineClassErrorMessage(error.message), "error");
  if (!data?.length) back(id, "Only the teacher of this class and subject (or an admin) can change this.", "error");
  revalidatePath(LIST);
  revalidatePath("/portal/online-classes");
  back(id, "Back on. Check the date and time are still right.");
}

async function deleteClass(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const classId = String(formData.get("class_id") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error");
  const { data, error } = await supabase.from("online_classes").delete().eq("id", id).select("id");
  if (error) back(id, onlineClassErrorMessage(error.message), "error");
  if (!data?.length) back(id, "Only the teacher of this class and subject (or an admin) can delete this.", "error");
  revalidatePath(LIST);
  revalidatePath("/portal/online-classes");
  redirect(`${LIST}?class_id=${classId}&toast=${encodeURIComponent("Online class deleted")}&toast_type=success`);
}

// Saves only the marks that changed since the page was opened (orig: fields).
async function saveAttendance(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const ids = String(formData.get("student_ids") ?? "").split(",").filter(Boolean);
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Server error — please try again later.", "error", "#attendance");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const rows = ids
    .map((sid) => ({ sid, value: String(formData.get(`status:${sid}`) ?? ""), orig: String(formData.get(`orig:${sid}`) ?? "") }))
    .filter((r) => r.value !== r.orig && ["present", "late", "absent", ""].includes(r.value))
    .map((r) => ({ online_class_id: id, student_id: r.sid, status: r.value || null, marked_by: user?.id ?? null, marked_at: now }));
  if (!rows.length) back(id, "Nothing had changed", "success", "#attendance");
  const { error } = await supabase.from("online_class_attendance").upsert(rows, { onConflict: "online_class_id,student_id" });
  if (error) back(id, onlineClassErrorMessage(error.message), "error", "#attendance");
  revalidatePath(`${LIST}/${id}`);
  back(id, `Attendance saved for ${rows.length} pupil${rows.length === 1 ? "" : "s"}`, "success", "#attendance");
}

export default async function OnlineClassPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const access = await getTeacherAccess(supabase);

  const { data: oData, error } = await supabase.from("online_classes").select(ONLINE_CLASS_COLUMNS).eq("id", id).maybeSingle();
  const o = oData as OnlineClassRow | null;
  if (!o) {
    return (
      <div className="space-y-6">
        <PageHeader back={{ href: LIST, label: "Online classes" }} eyebrow="Online classes" title="Online class" />
        {error ? (
          <Alert tone="danger">{onlineClassErrorMessage(error.message)}</Alert>
        ) : (
          <Card>
            <EmptyState
              icon={Video}
              title="This online class isn't available"
              description="It may have been deleted, or it's for a class or subject you don't teach."
              action={
                <ButtonLink href={LIST} variant="secondary" size="sm">
                  Back to online classes
                </ButtonLink>
              }
            />
          </Card>
        )}
      </div>
    );
  }

  const [{ data: cls }, { data: offered }, { data: pupilData }, { data: attData }, { data: noteData }] = await Promise.all([
    supabase.from("classes").select("name").eq("id", o.class_id).maybeSingle(),
    supabase.from("class_subjects").select("subjects(id, name)").eq("class_id", o.class_id),
    supabase.from("students").select("id, first_name, last_name, admission_number").eq("class_id", o.class_id).order("last_name").order("first_name"),
    supabase.from("online_class_attendance").select("student_id, joined_at, status").eq("online_class_id", o.id),
    supabase.from("lesson_notes").select("id, topic, week").eq("class_id", o.class_id).eq("status", "published").order("published_at", { ascending: false }).limit(60)
  ]);
  const className = (cls as { name: string } | null)?.name ?? "Class";
  const subjects = ((offered ?? []) as Array<{ subjects: { id: string; name: string } | { id: string; name: string }[] | null }>)
    .map((x) => firstOrNull(x.subjects))
    .filter((s): s is { id: string; name: string } => Boolean(s))
    .filter((s) => canTeach(access, o.class_id, s.id) || s.id === o.subject_id)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (o.subject_id && !subjects.some((s) => s.id === o.subject_id)) {
    const { data } = await supabase.from("subjects").select("id, name").eq("id", o.subject_id).maybeSingle();
    if (data) subjects.push(data as { id: string; name: string });
  }
  const canGeneral = !access.isTeacher || access.classTeacherClassIds.includes(o.class_id) || !o.subject_id;
  const subjectName = o.subject_id ? subjects.find((s) => s.id === o.subject_id)?.name ?? "Subject" : "General";
  const pupils = (pupilData ?? []) as Array<{ id: string; first_name: string; last_name: string; admission_number: string | null }>;
  const att = new Map(((attData ?? []) as Array<{ student_id: string; joined_at: string | null; status: Status | null }>).map((a) => [a.student_id, a] as const));
  const notes = (noteData ?? []) as Array<{ id: string; topic: string; week: number | null }>;
  const state = classState(o);
  const { date, time } = lagosDateTimeParts(o.starts_at);
  const started = state === "live" || state === "ended";
  const joinedCount = pupils.filter((p) => att.get(p.id)?.joined_at).length;
  const joinedAt = (iso: string) => lagosDateTimeParts(iso).time;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: `${LIST}?class_id=${o.class_id}`, label: "Online classes" }}
        learn={LEARN.onlineClasses}
        eyebrow={`${className} · ${subjectName}`}
        title={o.topic}
        description={`${whenLabel(o.starts_at, o.duration_minutes)} · ${PLATFORM_LABEL[o.platform]}${o.author_name ? ` · by ${o.author_name}` : ""}`}
        actions={
          state !== "cancelled" && state !== "ended" ? (
            <a href={o.meeting_url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ size: "sm" })}>
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Open the meeting
            </a>
          ) : undefined
        }
      />

      <Card className={state === "cancelled" ? "!border-red-200" : state === "live" ? "!border-brand-green-300" : undefined}>
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <Badge tone={STATE_TONE[state]} dot>
              {STATE_LABEL[state]}
            </Badge>
            <p className="text-sm text-slate-700">
              {state === "cancelled"
                ? `Pupils and parents see it as cancelled: “${o.cancel_reason ?? ""}”.`
                : state === "ended"
                  ? `${joinedCount} of ${pupils.length} pupils joined. Check the attendance below and save it.`
                  : state === "live"
                    ? `${joinedCount} of ${pupils.length} pupils have joined so far.`
                    : `Pupils can join from 15 minutes before the start. ${pupils.length} pupils expected.`}
            </p>
          </div>
          {state === "cancelled" ? (
            <form action={restoreClass}>
              <input type="hidden" name="id" value={o.id} />
              <SubmitButton variant="secondary" size="sm" pendingText="Restoring…">
                <span className="inline-flex items-center gap-1.5">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  It&apos;s on again
                </span>
              </SubmitButton>
            </form>
          ) : null}
        </CardBody>
      </Card>

      {started || state === "soon" ? (
        <form action={saveAttendance} id="attendance">
          <input type="hidden" name="id" value={o.id} />
          <input type="hidden" name="student_ids" value={pupils.map((p) => p.id).join(",")} />
          <Card>
            <CardHeader
              title="Attendance"
              description={
                state === "ended"
                  ? "Filled in from who joined: joined = Present, didn't join = Absent. Change any that are wrong, then save."
                  : "Who has joined so far. Save once the class is over."
              }
            />
            {pupils.length ? (
              <ul className="divide-y divide-slate-100">
                {pupils.map((p) => {
                  const a = att.get(p.id);
                  const saved = a?.status ?? "";
                  const suggested: string = saved || (state === "ended" ? (a?.joined_at ? "present" : "absent") : "");
                  return (
                    <li key={p.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-900">
                          {p.last_name} {p.first_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {a?.joined_at ? `Joined at ${joinedAt(a.joined_at)}` : "Didn't join"}
                          {saved ? ` · saved as ${STATUS_LABEL[saved as Status].toLowerCase()}` : ""}
                        </div>
                      </div>
                      <input type="hidden" name={`orig:${p.id}`} value={saved} />
                      <fieldset className="flex gap-1.5">
                        <legend className="sr-only">
                          Attendance for {p.first_name} {p.last_name}
                        </legend>
                        {(["present", "late", "absent"] as const).map((s) => (
                          <label key={s} className="cursor-pointer">
                            <input type="radio" name={`status:${p.id}`} value={s} defaultChecked={suggested === s} className="peer sr-only" />
                            <span
                              className={cn(
                                "inline-flex h-9 items-center rounded-full border px-3 text-sm font-semibold transition peer-focus-visible:ring-4 peer-focus-visible:ring-brand-green-500/20",
                                s === "absent"
                                  ? "border-slate-300 text-slate-700 peer-checked:border-red-300 peer-checked:bg-red-50 peer-checked:text-red-800"
                                  : s === "late"
                                    ? "border-slate-300 text-slate-700 peer-checked:border-brand-gold-300 peer-checked:bg-brand-gold-50 peer-checked:text-brand-gold-900"
                                    : "border-slate-300 text-slate-700 peer-checked:border-brand-green-500 peer-checked:bg-brand-green-50 peer-checked:text-brand-green-800"
                              )}
                            >
                              {STATUS_LABEL[s]}
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon={Users} title="No pupils in this class" description="Add pupils to the class to take attendance." />
            )}
            {pupils.length ? (
              <div className="sticky bottom-0 flex justify-end rounded-b-2xl border-t border-slate-200 bg-white px-5 py-3 sm:px-6">
                <SubmitButton pendingText="Saving…">
                  <span className="inline-flex items-center gap-2">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save attendance
                  </span>
                </SubmitButton>
              </div>
            ) : null}
          </Card>
        </form>
      ) : null}

      <form action={saveDetails}>
        <input type="hidden" name="id" value={o.id} />
        <input type="hidden" name="previous_start" value={o.starts_at} />
        <Card>
          <CardHeader title="Details" description="Change the date or time to reschedule; pupils and parents see the new time straight away." />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="d-subject" className="gf-label">
                  Subject
                </label>
                <select id="d-subject" name="subject_id" required defaultValue={o.subject_id ?? "none"} className="gf-select">
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                  {canGeneral ? <option value="none">General (no subject)</option> : null}
                </select>
              </div>
              <div>
                <label htmlFor="d-topic" className="gf-label">
                  Topic
                </label>
                <input id="d-topic" name="topic" required minLength={2} maxLength={160} defaultValue={o.topic} className="gf-input" />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="d-date" className="gf-label">
                  Date
                </label>
                <input id="d-date" name="date" type="date" required defaultValue={date} className="gf-input" />
              </div>
              <div>
                <label htmlFor="d-time" className="gf-label">
                  Starts at
                </label>
                <input id="d-time" name="time" type="time" required defaultValue={time} className="gf-input" />
              </div>
              <div>
                <label htmlFor="d-duration" className="gf-label">
                  Lasts
                </label>
                <select id="d-duration" name="duration" defaultValue={String(o.duration_minutes)} className="gf-select">
                  {Array.from(new Set([...DURATIONS, o.duration_minutes]))
                    .sort((a, b) => a - b)
                    .map((d) => (
                      <option key={d} value={d}>
                        {d < 60 ? `${d} minutes` : d % 60 ? `${Math.floor(d / 60)} h ${d % 60} min` : `${d / 60} hour${d === 60 ? "" : "s"}`}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <div>
                <label htmlFor="d-url" className="gf-label">
                  Meeting link
                </label>
                <input id="d-url" name="meeting_url" type="url" required inputMode="url" pattern="https://.+" defaultValue={o.meeting_url} className="gf-input" />
              </div>
              <div>
                <label htmlFor="d-code" className="gf-label">
                  Passcode <span className="font-normal text-slate-500">(if any)</span>
                </label>
                <input id="d-code" name="meeting_code" maxLength={100} defaultValue={o.meeting_code ?? ""} className="gf-input" autoComplete="off" />
              </div>
            </div>
            <div>
              <label htmlFor="d-description" className="gf-label">
                What to prepare <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <textarea id="d-description" name="description" rows={3} maxLength={5000} defaultValue={o.description ?? ""} className="gf-input" />
            </div>
            <div>
              <label htmlFor="d-note" className="gf-label">
                Lesson note <span className="font-normal text-slate-500">(optional)</span>
              </label>
              <select id="d-note" name="lesson_note_id" defaultValue={o.lesson_note_id ?? ""} className="gf-select">
                <option value="">None</option>
                {notes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.topic}
                    {n.week ? ` · Week ${n.week}` : ""}
                  </option>
                ))}
              </select>
            </div>
          </CardBody>
          <div className="flex justify-end rounded-b-2xl border-t border-slate-200 bg-white px-5 py-3 sm:px-6">
            <SubmitButton pendingText="Saving…">
              <span className="inline-flex items-center gap-2">
                <Save className="h-4 w-4" aria-hidden="true" />
                Save changes
              </span>
            </SubmitButton>
          </div>
        </Card>
      </form>

      <div className="grid gap-6 lg:grid-cols-2">
        {state !== "cancelled" && state !== "ended" ? (
          <Card>
            <CardHeader title="Cancel this class" description="Pupils and parents see that it's cancelled and your reason. You can turn it back on later." />
            <CardBody>
              <form action={cancelClass} className="space-y-2">
                <input type="hidden" name="id" value={o.id} />
                <label htmlFor="c-reason" className="gf-label">
                  Reason
                </label>
                <input id="c-reason" name="reason" required minLength={3} maxLength={500} className="gf-input" placeholder="e.g. Moved to Friday; teacher unwell" />
                <ConfirmSubmitButton confirmMessage={`Cancel "${o.topic}"? Pupils and parents will see it's cancelled.`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                  <Ban className="h-4 w-4" aria-hidden="true" />
                  Cancel class
                </ConfirmSubmitButton>
              </form>
            </CardBody>
          </Card>
        ) : null}
        <Card>
          <CardHeader title="Delete" description="Removes the class and its attendance for everyone. Use Cancel instead if pupils need to know it isn't happening." />
          <CardBody>
            <form action={deleteClass}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="class_id" value={o.class_id} />
              <ConfirmSubmitButton confirmMessage={`Delete "${o.topic}" and its attendance? This can't be undone.`} className={buttonClasses({ variant: "secondary", size: "sm" })}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Delete online class
              </ConfirmSubmitButton>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
