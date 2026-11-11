import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, ExternalLink, MousePointerClick, Settings2, Star } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canTeach, getTeacherAccess } from "@/lib/teacher-access";
import { firstOrNull } from "@/lib/relations";
import { lagosStartOfDayIso } from "@/lib/lagos-dates";
import { addDays, lagosToday, mondayOf } from "@/lib/mi-periods";
import {
  STAR_VIDEO_COLUMNS,
  cleanVideoUrl,
  starVideoErrorMessage,
  suggestStars,
  videoHost,
  weekLabel,
  type StarVideoRow,
  type Suggestion
} from "@/lib/star-videos";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Field } from "@/components/ui/form-section";
import { cn } from "@/lib/cn";
import { LEARN } from "@/lib/learn-guides";

// Star of the week videos: each week, for each class, a video of a pupil who did well in each of the class's two
// major subjects (chosen by an admin on Class subjects). Teachers post a link (Drive, YouTube …), pick the pupil
// (the page suggests the best marks of the week) and say why. The pupil's family is notified.

const PATH = "/admin/academics/star-videos";

type ClassRow = { id: string; level: string; name: string };
type Pupil = { id: string; first_name: string; last_name: string };

function back(classId: string, week: string, message: string, type: "success" | "error" = "success"): never {
  redirect(`${PATH}?class_id=${encodeURIComponent(classId)}&week=${week}&toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

async function saveStarVideo(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const subjectId = String(formData.get("subject_id") ?? "").trim();
  const week = mondayOf(String(formData.get("week") ?? lagosToday()));
  const studentId = String(formData.get("student_id") ?? "").trim();
  const url = cleanVideoUrl(String(formData.get("video_url") ?? ""));
  const reason = String(formData.get("reason") ?? "").trim().replace(/\s+/g, " ").slice(0, 500);
  if (!classId || !subjectId) back(classId, week, "Choose a class and subject first", "error");
  if (week > mondayOf(lagosToday())) back(classId, week, "You can't post for a week that hasn't started", "error");
  if (!studentId) back(classId, week, "Choose the pupil in the video", "error");
  if (!url) back(classId, week, "Paste the full video link (it starts with https://)", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back(classId, week, "Server error — please try again later.", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const [{ data: me }, { data: term }] = await Promise.all([
    user ? supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("academic_terms").select("id").eq("is_active", true).limit(1).maybeSingle()
  ]);
  const { error } = await supabase.from("star_videos").upsert(
    {
      class_id: classId,
      subject_id: subjectId,
      week_start: week,
      student_id: studentId,
      video_url: url,
      reason: reason || null,
      academic_term_id: (term as { id: string } | null)?.id ?? null,
      author_name: (me as { full_name?: string | null } | null)?.full_name || user?.email || null
    },
    { onConflict: "class_id,subject_id,week_start" }
  );
  if (error) back(classId, week, starVideoErrorMessage(error.message), "error");
  revalidatePath(PATH);
  revalidatePath("/portal/star-videos");
  back(classId, week, "Saved. The pupil and their parents can watch it on the portal.");
}

async function removeStarVideo(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const week = mondayOf(String(formData.get("week") ?? lagosToday()));
  const id = String(formData.get("id") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase) back(classId, week, "Server error — please try again later.", "error");
  const { error } = await supabase.from("star_videos").delete().eq("id", id);
  if (error) back(classId, week, starVideoErrorMessage(error.message), "error");
  revalidatePath(PATH);
  revalidatePath("/portal/star-videos");
  back(classId, week, "Video removed.");
}

export default async function StarVideosPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const access = await getTeacherAccess(supabase);

  const today = lagosToday();
  const thisWeek = mondayOf(today);
  const askedWeek = typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? mondayOf(sp.week) : thisWeek;
  const week = askedWeek > thisWeek ? thisWeek : askedWeek;

  const { data: allClasses } = access.isTeacher
    ? { data: [] }
    : await supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name");
  const classes: ClassRow[] = access.isTeacher ? access.classes : ((allClasses ?? []) as ClassRow[]);
  const classIds = classes.map((c) => c.id);
  const requested = typeof sp.class_id === "string" ? sp.class_id : "";
  const classId = classes.some((c) => c.id === requested) ? requested : "";
  const cls = classes.find((c) => c.id === classId) ?? null;

  const [{ data: majorData, error: majorError }, { data: videoData, error: videoError }] = classIds.length
    ? await Promise.all([
        supabase.from("class_subjects").select("class_id, subject_id, subjects(id, name)").in("class_id", classIds).eq("is_major", true),
        supabase.from("star_videos").select(STAR_VIDEO_COLUMNS).in("class_id", classIds).eq("week_start", week)
      ])
    : [{ data: [], error: null }, { data: [], error: null }];
  const needsUpdate = Boolean(majorError || videoError);

  const majorsByClass = new Map<string, Array<{ id: string; name: string }>>();
  for (const m of (majorData ?? []) as Array<{ class_id: string; subjects: { id: string; name: string } | { id: string; name: string }[] | null }>) {
    const s = firstOrNull(m.subjects);
    if (!s) continue;
    majorsByClass.set(m.class_id, [...(majorsByClass.get(m.class_id) ?? []), s].sort((a, b) => a.name.localeCompare(b.name)));
  }
  const videos = (videoData ?? []) as StarVideoRow[];
  const videoFor = (c: string, s: string) => videos.find((v) => v.class_id === c && v.subject_id === s) ?? null;

  const majors = cls ? majorsByClass.get(cls.id) ?? [] : [];
  const weekStartIso = lagosStartOfDayIso(week) ?? `${week}T00:00:00Z`;
  const weekEndIso = lagosStartOfDayIso(addDays(week, 7)) ?? `${addDays(week, 7)}T00:00:00Z`;
  const [{ data: pupilData }, suggestions] = cls
    ? await Promise.all([
        supabase.from("students").select("id, first_name, last_name").eq("class_id", cls.id).in("status", ["active", "enrolled"]).order("first_name"),
        Promise.all(majors.map((m) => (canTeach(access, cls.id, m.id) ? suggestStars(supabase, cls.id, m.id, weekStartIso, weekEndIso) : Promise.resolve([] as Suggestion[]))))
      ])
    : [{ data: [] }, [] as Suggestion[][]];
  const pupils = (pupilData ?? []) as Pupil[];
  const pupilName = (id: string) => {
    const p = pupils.find((x) => x.id === id);
    return p ? `${p.first_name} ${p.last_name}` : "A pupil";
  };

  const href = (c: string, w: string) => `${PATH}?${c ? `class_id=${c}&` : ""}week=${w}`;
  const weekWord = week === thisWeek ? "This week" : week === addDays(thisWeek, -7) ? "Last week" : "Week";

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.starVideos}
        eyebrow="Academics"
        title="Star of the week videos"
        description="Each week, share a short video of a pupil who did well in each of the class's two major subjects. Leadership sees them in the management pack, and the pupil's family can watch on the portal."
        actions={
          !access.isTeacher ? (
            <ButtonLink href={classId ? `/admin/academics/class-subjects?class_id=${classId}` : "/admin/academics/class-subjects"} variant="secondary">
              <Settings2 className="h-4 w-4" aria-hidden="true" />
              Choose major subjects
            </ButtonLink>
          ) : undefined
        }
      />

      {needsUpdate ? (
        <Alert tone="warning" title="Star videos need a database update">
          Run docs/migrations/20261112_star_videos.sql in Supabase, then reload this page.
        </Alert>
      ) : null}

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-card">
        <Link href={href(classId, addDays(week, -7))} className={buttonClasses({ variant: "secondary", size: "sm" })} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{weekWord}</div>
          <div className="font-semibold text-slate-900">{weekLabel(week)}</div>
        </div>
        {week < thisWeek ? (
          <Link href={href(classId, addDays(week, 7))} className={buttonClasses({ variant: "secondary", size: "sm" })} aria-label="Next week">
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "pointer-events-none opacity-40")} aria-hidden="true">
            <ChevronRight className="h-4 w-4" />
          </span>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader title="Classes" description="Videos posted this week" />
          {classes.length ? (
            <nav aria-label="Classes" className="max-h-[60vh] divide-y divide-slate-100 overflow-y-auto">
              {classes.map((c) => {
                const ms = majorsByClass.get(c.id) ?? [];
                const done = ms.filter((m) => videoFor(c.id, m.id)).length;
                return (
                  <Link
                    key={c.id}
                    href={href(c.id, week)}
                    aria-current={c.id === classId ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-3 border-l-2 px-5 py-3 text-sm transition last:rounded-b-2xl sm:px-6",
                      c.id === classId ? "border-l-brand-green bg-brand-green-50 font-semibold text-slate-900" : "border-l-transparent text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {c.level} - {c.name}
                    </span>
                    {!ms.length ? (
                      <Badge tone="slate">No major subjects</Badge>
                    ) : done >= ms.length ? (
                      <Badge tone="green">{`${done} of ${ms.length} posted`}</Badge>
                    ) : (
                      <Badge tone="gold">{`${done} of ${ms.length} posted`}</Badge>
                    )}
                  </Link>
                );
              })}
            </nav>
          ) : (
            <EmptyState icon={Star} title="No classes" description="You aren't assigned to a class or subject yet. Ask an admin." />
          )}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {!cls ? (
            <Card>
              <EmptyState icon={MousePointerClick} title="Pick a class" description="Pick a class to post or check its star videos for the week." />
            </Card>
          ) : !majors.length ? (
            <Alert tone="warning" title="This class has no major subjects yet">
              An admin chooses the class&apos;s two major subjects on{" "}
              <Link href={`/admin/academics/class-subjects?class_id=${cls.id}`} className="gf-link">
                Class subjects
              </Link>
              . Then you can post its star videos here.
            </Alert>
          ) : (
            majors.map((m, i) => {
              const v = videoFor(cls.id, m.id);
              const allowed = canTeach(access, cls.id, m.id);
              const sugg = suggestions[i] ?? [];
              const suggested = new Map(sugg.map((s) => [s.studentId, s] as const));
              const ordered = [...pupils].sort((a, b) => (suggested.get(b.id)?.percent ?? -1) - (suggested.get(a.id)?.percent ?? -1));
              return (
                <Card key={m.id}>
                  <CardHeader
                    title={m.name}
                    description={`${cls.level} - ${cls.name} · ${weekLabel(week)}`}
                    action={v ? <Badge tone="green" dot>Posted</Badge> : <Badge tone="gold" dot>Not posted yet</Badge>}
                  />
                  <CardBody className="space-y-5">
                    {v ? (
                      <div className="flex flex-col gap-3 rounded-xl bg-brand-green-50/60 p-4 ring-1 ring-inset ring-brand-green-100 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 font-semibold text-slate-900">
                            <Star className="h-4 w-4 text-brand-gold-600" aria-hidden="true" />
                            {pupilName(v.student_id)}
                          </div>
                          {v.reason ? <p className="mt-1 text-sm text-slate-700">{v.reason}</p> : null}
                          <p className="mt-1 text-xs text-slate-500">Posted by {v.author_name ?? "a teacher"}</p>
                        </div>
                        <a href={v.video_url} target="_blank" rel="noopener noreferrer" className={buttonClasses({ variant: "secondary", size: "sm" })}>
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          Watch on {videoHost(v.video_url)}
                        </a>
                      </div>
                    ) : null}

                    {!allowed ? (
                      <p className="text-sm text-slate-500">Only the class teacher or the {m.name} teacher can post this video.</p>
                    ) : (
                      <form action={saveStarVideo} className="space-y-4">
                        <input type="hidden" name="class_id" value={cls.id} />
                        <input type="hidden" name="subject_id" value={m.id} />
                        <input type="hidden" name="week" value={week} />
                        {sugg.length ? (
                          <div className="text-sm text-slate-600">
                            <span className="font-medium text-slate-700">Best marks on {m.name} work this week: </span>
                            {sugg.map((s, k) => (
                              <span key={s.studentId}>
                                {k ? ", " : ""}
                                {pupilName(s.studentId)} ({s.percent}%)
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">No {m.name} work was marked this week, so there&apos;s no suggestion. Choose the pupil yourself.</p>
                        )}
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Pupil in the video" htmlFor={`pupil-${m.id}`}>
                            <select id={`pupil-${m.id}`} name="student_id" className="gf-select" required defaultValue={v?.student_id ?? ""}>
                              <option value="">Choose a pupil</option>
                              {ordered.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.first_name} {p.last_name}
                                  {suggested.has(p.id) ? ` · ${suggested.get(p.id)!.percent}% this week` : ""}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Video link" htmlFor={`url-${m.id}`} hint="From Google Drive or YouTube. Set it so anyone with the link can view.">
                            <input
                              id={`url-${m.id}`}
                              name="video_url"
                              type="url"
                              inputMode="url"
                              required
                              placeholder="https://"
                              defaultValue={v?.video_url ?? ""}
                              className="gf-input"
                            />
                          </Field>
                        </div>
                        <Field label="Why they're the star (optional)" htmlFor={`reason-${m.id}`} hint="The family sees this. One or two sentences.">
                          <textarea id={`reason-${m.id}`} name="reason" rows={2} maxLength={500} defaultValue={v?.reason ?? ""} className="gf-input" />
                        </Field>
                        <div className="flex flex-wrap gap-2">
                          <SubmitButton pendingText="Saving…">{v ? "Save changes" : "Post video"}</SubmitButton>
                        </div>
                      </form>
                    )}

                    {v && allowed ? (
                      <form action={removeStarVideo}>
                        <input type="hidden" name="class_id" value={cls.id} />
                        <input type="hidden" name="week" value={week} />
                        <input type="hidden" name="id" value={v.id} />
                        <ConfirmSubmitButton
                          className={buttonClasses({ variant: "ghost", size: "sm" })}
                          confirmMessage={`Remove the ${m.name} star video for ${weekLabel(week)}? The family won't see it any more.`}
                        >
                          Remove video
                        </ConfirmSubmitButton>
                      </form>
                    ) : null}
                  </CardBody>
                </Card>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
