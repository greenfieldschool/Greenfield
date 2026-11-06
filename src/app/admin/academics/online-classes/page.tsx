import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalendarPlus, ChevronRight, Video } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canTeach, getTeacherAccess } from "@/lib/teacher-access";
import { firstOrNull } from "@/lib/relations";
import { lagosDueAt } from "@/lib/assignments";
import {
  DURATIONS,
  ONLINE_CLASS_COLUMNS,
  PLATFORM_LABEL,
  STATE_LABEL,
  STATE_TONE,
  classState,
  cleanMeetingUrl,
  dayHeading,
  lagosDay,
  onlineClassErrorMessage,
  platformFromUrl,
  startsIn,
  whenLabel,
  type OnlineClassRow
} from "@/lib/online-classes";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { LEARN } from "@/lib/learn-guides";

// Teachers schedule online video classes for their classes (see lib/online-classes.ts): what's live now, what's
// coming up by day, what's been held, and a form to schedule a new one.

const PATH = "/admin/academics/online-classes";

type ClassRow = { id: string; level: string; name: string };

function back(classId: string, message: string, type: "success" | "error" = "success"): never {
  redirect(`${PATH}?class_id=${encodeURIComponent(classId)}&toast=${encodeURIComponent(message)}&toast_type=${type}#new`);
}

async function scheduleClass(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const subjectRaw = String(formData.get("subject_id") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim().replace(/\s+/g, " ");
  const description = String(formData.get("description") ?? "").trim();
  const startsAt = lagosDueAt(String(formData.get("date") ?? ""), String(formData.get("time") ?? ""));
  const duration = Number(formData.get("duration") ?? 40);
  const url = cleanMeetingUrl(String(formData.get("meeting_url") ?? ""));
  const code = String(formData.get("meeting_code") ?? "").trim();
  const noteId = String(formData.get("lesson_note_id") ?? "").trim();
  if (!classId) back(classId, "Choose a class first", "error");
  if (!subjectRaw) back(classId, "Choose the subject", "error");
  if (topic.length < 2) back(classId, "Give the topic", "error");
  if (!startsAt) back(classId, "Choose the date and start time", "error");
  if (new Date(startsAt).getTime() < Date.now() - 5 * 60000) back(classId, "That time has already passed. Choose a time from now on.", "error");
  if (!Number.isInteger(duration) || duration < 5 || duration > 300) back(classId, "Choose how long the class lasts", "error");
  if (!url) back(classId, "Paste the full meeting link from Zoom, Google Meet or Teams (it starts with https://)", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back(classId, "Server error — please try again later.", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const [{ data: me }, { data: term }] = await Promise.all([
    user ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("academic_terms").select("id").eq("is_active", true).limit(1).maybeSingle()
  ]);

  const { data, error } = await supabase
    .from("online_classes")
    .insert({
      class_id: classId,
      subject_id: subjectRaw === "none" ? null : subjectRaw,
      academic_term_id: (term as { id: string } | null)?.id ?? null,
      topic,
      description: description || null,
      starts_at: startsAt,
      duration_minutes: duration,
      platform: platformFromUrl(url),
      meeting_url: url,
      meeting_code: code || null,
      lesson_note_id: noteId || null,
      author_name: (me as { full_name?: string | null } | null)?.full_name || user?.email || null
    })
    .select("id")
    .single();
  if (error || !data) back(classId, onlineClassErrorMessage(error?.message ?? "Couldn't save"), "error");
  revalidatePath(PATH);
  revalidatePath("/portal/online-classes");
  redirect(`${PATH}/${(data as { id: string }).id}?toast=${encodeURIComponent("Scheduled. Pupils and parents of the class can see it now.")}&toast_type=success`);
}

export default async function OnlineClassesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const access = await getTeacherAccess(supabase);

  const { data: allClasses } = access.isTeacher
    ? { data: [] }
    : await supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name");
  const classes: ClassRow[] = access.isTeacher ? access.classes : ((allClasses ?? []) as ClassRow[]);
  const requested = typeof sp.class_id === "string" ? sp.class_id : "";
  const classId = classes.some((c) => c.id === requested) ? requested : classes[0]?.id ?? "";
  const cls = classes.find((c) => c.id === classId) ?? null;

  const [{ data: offered }, { data: classData, error: tableError }, { data: pupils }, { data: noteData }] = classId
    ? await Promise.all([
        supabase.from("class_subjects").select("subjects(id, name)").eq("class_id", classId),
        supabase.from("online_classes").select(ONLINE_CLASS_COLUMNS).eq("class_id", classId).order("starts_at", { ascending: true }).limit(300),
        supabase.from("students").select("id").eq("class_id", classId),
        supabase.from("lesson_notes").select("id, topic, subject_id, week").eq("class_id", classId).eq("status", "published").order("published_at", { ascending: false }).limit(60)
      ])
    : [{ data: [] }, { data: [], error: null }, { data: [] }, { data: [] }];

  const subjectOptions = ((offered ?? []) as Array<{ subjects: { id: string; name: string } | { id: string; name: string }[] | null }>)
    .map((o) => firstOrNull(o.subjects))
    .filter((s): s is { id: string; name: string } => Boolean(s))
    .filter((s) => canTeach(access, classId, s.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const canGeneral = !access.isTeacher || access.classTeacherClassIds.includes(classId);
  const subjectName = new Map(subjectOptions.map((s) => [s.id, s.name] as const));
  const all = (classData ?? []) as OnlineClassRow[];
  const missing = Array.from(new Set(all.map((o) => o.subject_id).filter((s): s is string => Boolean(s) && !subjectName.has(s as string))));
  if (missing.length) {
    const { data } = await supabase.from("subjects").select("id, name").in("id", missing);
    for (const s of (data ?? []) as Array<{ id: string; name: string }>) subjectName.set(s.id, s.name);
  }
  const notes = (noteData ?? []) as Array<{ id: string; topic: string; subject_id: string | null; week: number | null }>;
  const pupilCount = (pupils ?? []).length;

  // How many joined each class that has started.
  const startedIds = all.filter((o) => ["live", "ended"].includes(classState(o))).map((o) => o.id);
  const { data: joinData } = startedIds.length
    ? await supabase.from("online_class_attendance").select("online_class_id").in("online_class_id", startedIds).not("joined_at", "is", null)
    : { data: [] };
  const joined = new Map<string, number>();
  for (const j of (joinData ?? []) as Array<{ online_class_id: string }>) joined.set(j.online_class_id, (joined.get(j.online_class_id) ?? 0) + 1);

  const now = new Date();
  const today = lagosDay(now.toISOString());
  const withState = all.map((o) => ({ o, state: classState(o, now) }));
  const live = withState.filter((x) => x.state === "live" || x.state === "soon");
  const upcoming = withState.filter((x) => x.state === "upcoming" || (x.state === "cancelled" && new Date(x.o.starts_at) >= now));
  const past = withState.filter((x) => x.state === "ended" || (x.state === "cancelled" && new Date(x.o.starts_at) < now)).reverse().slice(0, 30);
  const byDay: Array<{ day: string; items: typeof upcoming }> = [];
  for (const x of upcoming) {
    const day = lagosDay(x.o.starts_at);
    const last = byDay[byDay.length - 1];
    if (last && last.day === day) last.items.push(x);
    else byDay.push({ day, items: [x] });
  }
  const canWrite = subjectOptions.length > 0 || canGeneral;

  const Row = ({ o, state }: { o: OnlineClassRow; state: ReturnType<typeof classState> }) => (
    <li>
      <a href={`${PATH}/${o.id}`} className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50 active:bg-slate-100 sm:px-6">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-700">
          <Video className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={state === "cancelled" ? "font-semibold text-slate-500 line-through" : "font-semibold text-slate-900"}>{o.topic}</span>
            <Badge tone={STATE_TONE[state]} dot>
              {STATE_LABEL[state]}
            </Badge>
          </div>
          <div className="mt-0.5 text-sm text-slate-500">
            {o.subject_id ? subjectName.get(o.subject_id) ?? "Subject" : "General"} · {whenLabel(o.starts_at, o.duration_minutes)} · {PLATFORM_LABEL[o.platform]}
            {state === "live" || state === "ended" ? ` · ${joined.get(o.id) ?? 0} of ${pupilCount} joined` : ""}
            {state === "upcoming" ? ` · ${startsIn(o.starts_at, now)}` : ""}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
      </a>
    </li>
  );

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.onlineClasses}
        eyebrow="Academics"
        title="Online classes"
        description="Schedule a video lesson on Zoom, Google Meet or Teams for a class. Pupils and parents see it on the portal and join from there; who joined is recorded for attendance."
        actions={
          classId && canWrite ? (
            <ButtonLink href="#new" size="sm">
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              Schedule a class
            </ButtonLink>
          ) : undefined
        }
      />

      {tableError ? <Alert tone="warning">{onlineClassErrorMessage(tableError.message)}</Alert> : null}

      {!classes.length ? (
        <Alert tone="warning">No classes are assigned to you yet. Ask an admin to assign you to a class or subject (Teacher assignments).</Alert>
      ) : (
        <>
          <Card>
            <CardBody>
              <form method="get" action={PATH} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="oc-class" className="gf-label">
                    Class
                  </label>
                  <select id="oc-class" name="class_id" defaultValue={classId} className="gf-select">
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.level} · {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <button type="submit" className={buttonClasses({ variant: "secondary" })}>
                  Open
                </button>
              </form>
            </CardBody>
          </Card>

          {live.length ? (
            <Card className="!border-brand-green-300">
              <CardHeader title="Now" description="Running now, or opening for pupils in the next 15 minutes." />
              <ul className="divide-y divide-slate-100">
                {live.map((x) => (
                  <Row key={x.o.id} o={x.o} state={x.state} />
                ))}
              </ul>
            </Card>
          ) : null}

          <Card>
            <CardHeader title={`${cls?.name ?? "Class"} · coming up`} description={`${pupilCount} pupil${pupilCount === 1 ? "" : "s"} expected in each class.`} />
            {byDay.length ? (
              <div className="divide-y divide-slate-100">
                {byDay.map((g) => (
                  <section key={g.day} aria-label={dayHeading(g.day, today)}>
                    <h3 className="bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-6">{dayHeading(g.day, today)}</h3>
                    <ul className="divide-y divide-slate-100">
                      {g.items.map((x) => (
                        <Row key={x.o.id} o={x.o} state={x.state} />
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <EmptyState icon={Video} title="Nothing scheduled" description={canWrite ? "Schedule the next online class below." : "Online classes appear here once a teacher schedules them."} />
            )}
          </Card>

          {past.length ? (
            <Card>
              <CardHeader title="Held so far" description="Newest first. Open one to check and save attendance." />
              <ul className="divide-y divide-slate-100">
                {past.map((x) => (
                  <Row key={x.o.id} o={x.o} state={x.state} />
                ))}
              </ul>
            </Card>
          ) : null}

          <Card id="new">
            <CardHeader title="Schedule an online class" description={`For ${cls?.name ?? "this class"}. Pupils and parents see it on the portal as soon as you save.`} />
            {canWrite ? (
              <form action={scheduleClass} className="space-y-4 px-5 pb-5 sm:px-6">
                <input type="hidden" name="class_id" value={classId} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="oc-subject" className="gf-label">
                      Subject
                    </label>
                    <select id="oc-subject" name="subject_id" required defaultValue="" className="gf-select">
                      <option value="" disabled>
                        Choose…
                      </option>
                      {subjectOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      {canGeneral ? <option value="none">General (no subject)</option> : null}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="oc-topic" className="gf-label">
                      Topic
                    </label>
                    <input id="oc-topic" name="topic" required minLength={2} maxLength={160} className="gf-input" placeholder="e.g. Fractions: revision before the test" />
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="oc-date" className="gf-label">
                      Date
                    </label>
                    <input id="oc-date" name="date" type="date" required min={today} defaultValue={today} className="gf-input" />
                  </div>
                  <div>
                    <label htmlFor="oc-time" className="gf-label">
                      Starts at
                    </label>
                    <input id="oc-time" name="time" type="time" required defaultValue="16:00" className="gf-input" />
                  </div>
                  <div>
                    <label htmlFor="oc-duration" className="gf-label">
                      Lasts
                    </label>
                    <select id="oc-duration" name="duration" defaultValue="40" className="gf-select">
                      {DURATIONS.map((d) => (
                        <option key={d} value={d}>
                          {d < 60 ? `${d} minutes` : d % 60 ? `${Math.floor(d / 60)} h ${d % 60} min` : `${d / 60} hour${d === 60 ? "" : "s"}`}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
                  <div>
                    <label htmlFor="oc-url" className="gf-label">
                      Meeting link
                    </label>
                    <input
                      id="oc-url"
                      name="meeting_url"
                      type="url"
                      required
                      inputMode="url"
                      pattern="https://.+"
                      className="gf-input"
                      placeholder="https://zoom.us/j/… or https://meet.google.com/…"
                    />
                    <p className="gf-hint mt-1">Create the meeting in Zoom, Google Meet or Teams first, then copy its link here.</p>
                  </div>
                  <div>
                    <label htmlFor="oc-code" className="gf-label">
                      Passcode <span className="font-normal text-slate-500">(if any)</span>
                    </label>
                    <input id="oc-code" name="meeting_code" maxLength={100} className="gf-input" autoComplete="off" />
                  </div>
                </div>
                <div>
                  <label htmlFor="oc-description" className="gf-label">
                    What to prepare <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <textarea id="oc-description" name="description" rows={3} maxLength={5000} className="gf-input" placeholder="e.g. Have your exercise book and a pencil ready. Read page 24 first." />
                </div>
                {notes.length ? (
                  <div>
                    <label htmlFor="oc-note" className="gf-label">
                      Lesson note for this class <span className="font-normal text-slate-500">(optional)</span>
                    </label>
                    <select id="oc-note" name="lesson_note_id" defaultValue="" className="gf-select">
                      <option value="">None</option>
                      {notes.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.topic}
                          {n.subject_id ? ` · ${subjectName.get(n.subject_id) ?? "Subject"}` : ""}
                          {n.week ? ` · Week ${n.week}` : ""}
                        </option>
                      ))}
                    </select>
                    <p className="gf-hint mt-1">Pupils see a link to it with the class. Only published notes are listed.</p>
                  </div>
                ) : null}
                <SubmitButton pendingText="Scheduling…">
                  <span className="inline-flex items-center gap-2">
                    <CalendarPlus className="h-4 w-4" aria-hidden="true" />
                    Schedule online class
                  </span>
                </SubmitButton>
              </form>
            ) : (
              <CardBody>
                <EmptyState icon={Video} title="No subjects you teach in this class" description="Ask an admin to assign you a subject in this class (Teacher assignments)." />
              </CardBody>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
