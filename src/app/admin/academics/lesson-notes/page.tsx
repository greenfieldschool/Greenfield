import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { BookOpenText, ChevronRight, FileText, Plus } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canTeach, getTeacherAccess } from "@/lib/teacher-access";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate } from "@/lib/lagos-dates";
import {
  NOTE_COLUMNS,
  fileKind,
  lessonNoteErrorMessage,
  noteWeeks,
  weekLabel,
  type LessonNoteRow
} from "@/lib/lesson-notes";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { LEARN } from "@/lib/learn-guides";
import { cn } from "@/lib/cn";

// Teachers prepare lesson notes for their classes (see lib/lesson-notes.ts): pick the class and term, see the
// notes by week, and start a new one. A new note is a draft; the file is added and the note published on its page.

const PATH = "/admin/academics/lesson-notes";

type ClassRow = { id: string; level: string; name: string };
type TermRow = { id: string; name: string; academic_year_id: string; starts_on: string | null; ends_on: string | null; is_active: boolean };

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

function url(params: Record<string, string | undefined>, hash = "") {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
  const s = q.toString();
  return `${PATH}${s ? `?${s}` : ""}${hash}`;
}

function back(params: Record<string, string>, message: string, type: "success" | "error" = "success"): never {
  redirect(url({ ...params, toast: message, toast_type: type }, "#new"));
}

async function createNote(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const termId = String(formData.get("term_id") ?? "").trim();
  const subjectRaw = String(formData.get("subject_id") ?? "").trim();
  const weekRaw = String(formData.get("week") ?? "").trim();
  const topic = String(formData.get("topic") ?? "").trim().replace(/\s+/g, " ");
  const params = { class_id: classId, term_id: termId };
  if (!classId || !termId) back(params, "Choose the class and term first", "error");
  if (!subjectRaw) back(params, "Choose the subject", "error");
  if (topic.length < 2) back(params, "Give the topic", "error");
  const week = weekRaw ? Number(weekRaw) : null;
  if (week !== null && (!Number.isInteger(week) || week < 1 || week > 30)) back(params, "Choose a week", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back(params, "Server error — please try again later.", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const { data: me } = user ? await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle() : { data: null };

  const { data, error } = await supabase
    .from("lesson_notes")
    .insert({
      class_id: classId,
      subject_id: subjectRaw === "none" ? null : subjectRaw,
      academic_term_id: termId,
      week,
      topic,
      author_name: (me as { full_name?: string | null } | null)?.full_name || user?.email || null
    })
    .select("id")
    .single();
  if (error || !data) back(params, lessonNoteErrorMessage(error?.message ?? "Couldn't save"), "error");
  revalidatePath(PATH);
  redirect(`${PATH}/${(data as { id: string }).id}?toast=${encodeURIComponent("Draft saved. Now type the notes or attach the file, then publish.")}&toast_type=success`);
}

export default async function LessonNotesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const access = await getTeacherAccess(supabase);

  const [{ data: allClasses }, { data: termData }, { data: yearData }] = await Promise.all([
    access.isTeacher ? Promise.resolve({ data: [] }) : supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
    supabase.from("academic_terms").select("id, name, academic_year_id, starts_on, ends_on, is_active").order("starts_on", { ascending: false }),
    supabase.from("academic_years").select("id, name")
  ]);
  const classes: ClassRow[] = access.isTeacher ? access.classes : ((allClasses ?? []) as ClassRow[]);
  const terms = (termData ?? []) as TermRow[];
  const yearName = new Map(((yearData ?? []) as Array<{ id: string; name: string }>).map((y) => [y.id, y.name] as const));
  const termLabel = (t: TermRow) => [yearName.get(t.academic_year_id), t.name].filter(Boolean).join(" · ");

  const classId = classes.some((c) => c.id === str(sp.class_id)) ? str(sp.class_id) : classes[0]?.id ?? "";
  const termId = terms.some((t) => t.id === str(sp.term_id)) ? str(sp.term_id) : terms.find((t) => t.is_active)?.id ?? terms[0]?.id ?? "";
  const subjectFilter = str(sp.subject);
  const statusFilter = str(sp.status) === "draft" || str(sp.status) === "published" ? str(sp.status) : "";
  const cls = classes.find((c) => c.id === classId) ?? null;
  const term = terms.find((t) => t.id === termId) ?? null;
  const { weeks, current } = noteWeeks(term);

  const [{ data: offered }, { data: noteData, error: tableError }] = classId
    ? await Promise.all([
        supabase.from("class_subjects").select("subject_id, subjects(id, name)").eq("class_id", classId),
        termId
          ? supabase.from("lesson_notes").select(NOTE_COLUMNS).eq("class_id", classId).eq("academic_term_id", termId).order("updated_at", { ascending: false })
          : Promise.resolve({ data: [], error: null })
      ])
    : [{ data: [] }, { data: [], error: null }];

  const subjectOptions = ((offered ?? []) as Array<{ subjects: { id: string; name: string } | { id: string; name: string }[] | null }>)
    .map((o) => firstOrNull(o.subjects))
    .filter((s): s is { id: string; name: string } => Boolean(s))
    .filter((s) => canTeach(access, classId, s.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const canWriteGeneral = !access.isTeacher || access.classTeacherClassIds.includes(classId);
  const subjectName = new Map(subjectOptions.map((s) => [s.id, s.name] as const));

  const allNotes = (noteData ?? []) as LessonNoteRow[];
  // Names of subjects the teacher can see notes for but that aren't in the class list any more.
  const missing = Array.from(new Set(allNotes.map((n) => n.subject_id).filter((s): s is string => Boolean(s) && !subjectName.has(s as string))));
  if (missing.length) {
    const { data } = await supabase.from("subjects").select("id, name").in("id", missing);
    for (const s of (data ?? []) as Array<{ id: string; name: string }>) subjectName.set(s.id, s.name);
  }
  // Latest week first (next week's drafts and this week at the top), notes with no week last.
  const notes = [...allNotes]
    .sort((a, b) => (b.week ?? 0) - (a.week ?? 0) || b.updated_at.localeCompare(a.updated_at))
    .filter(
    (n) =>
      (!subjectFilter || (subjectFilter === "none" ? !n.subject_id : n.subject_id === subjectFilter)) && (!statusFilter || n.status === statusFilter)
  );

  const published = allNotes.filter((n) => n.status === "published").length;
  const drafts = allNotes.length - published;
  const weeksCovered = new Set(allNotes.filter((n) => n.status === "published" && n.week).map((n) => n.week)).size;

  const groups: Array<{ week: number | null; items: LessonNoteRow[] }> = [];
  for (const n of notes) {
    const last = groups[groups.length - 1];
    if (last && last.week === n.week) last.items.push(n);
    else groups.push({ week: n.week, items: [n] });
  }

  const filterLinks = [
    { key: "", label: `All (${allNotes.length})` },
    { key: "published", label: `Published (${published})` },
    { key: "draft", label: `Drafts (${drafts})` }
  ];
  const base = { class_id: classId, term_id: termId, subject: subjectFilter || undefined };
  const canWrite = subjectOptions.length > 0 || canWriteGeneral;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.lessonNotes}
        eyebrow="Academics"
        title="Lesson notes"
        description="Prepare lesson notes by class, subject, term, week and topic. Type them or upload a PDF, Word or PowerPoint file. Save as a draft, then publish: pupils and parents of the class can then read and download them on the portal."
        actions={
          classId && canWrite ? (
            <ButtonLink href="#new" size="sm">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New lesson note
            </ButtonLink>
          ) : undefined
        }
      />

      {tableError ? <Alert tone="warning">{lessonNoteErrorMessage(tableError.message)}</Alert> : null}

      {!classes.length ? (
        <Alert tone="warning">No classes are assigned to you yet. Ask an admin to assign you to a class or subject (Teacher assignments).</Alert>
      ) : (
        <>
          <Card>
            <CardBody>
              <form method="get" action={PATH} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
                <div>
                  <label htmlFor="ln-class" className="gf-label">
                    Class
                  </label>
                  <select id="ln-class" name="class_id" defaultValue={classId} className="gf-select">
                    {classes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.level} · {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ln-term" className="gf-label">
                    Term
                  </label>
                  <select id="ln-term" name="term_id" defaultValue={termId} className="gf-select">
                    {terms.map((t) => (
                      <option key={t.id} value={t.id}>
                        {termLabel(t)}
                        {t.is_active ? " (current)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="ln-subject" className="gf-label">
                    Subject
                  </label>
                  <select id="ln-subject" name="subject" defaultValue={subjectFilter} className="gf-select">
                    <option value="">All subjects</option>
                    {subjectOptions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                    {canWriteGeneral ? <option value="none">General (no subject)</option> : null}
                  </select>
                </div>
                <button type="submit" className={buttonClasses({ variant: "secondary", className: "sm:col-span-2 lg:col-span-1" })}>
                  Show
                </button>
              </form>
            </CardBody>
          </Card>

          {!tableError ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <StatCard label="Published" value={published} hint="pupils and parents can read these" icon={BookOpenText} />
              <StatCard label="Drafts" value={drafts} hint={drafts ? "only staff can see these" : "nothing waiting"} tone={drafts ? "gold" : "slate"} />
              <StatCard
                label="Weeks with notes"
                value={`${weeksCovered} of ${weeks.length}`}
                hint={current ? `this is week ${current}` : term ? termLabel(term) : ""}
                tone="blue"
              />
            </div>
          ) : null}

          <Card>
            <CardHeader
              title={`${cls?.name ?? "Class"} · ${term ? term.name : "Term"}`}
              description="Latest week first. Open a note to add or replace its file, publish it, or take it back to draft."
            />
            <nav aria-label="Show" className="flex flex-wrap gap-1.5 border-b border-slate-100 px-5 pb-4 sm:px-6">
                  {filterLinks.map((f) => (
                    <Link
                      key={f.key || "all"}
                      href={url({ ...base, status: f.key || undefined })}
                      aria-current={statusFilter === f.key ? "page" : undefined}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold transition",
                        statusFilter === f.key
                          ? "border-brand-green bg-brand-green text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-brand-green-300 hover:bg-brand-green-50"
                      )}
                    >
                      {f.label}
                    </Link>
                  ))}
                </nav>

            {groups.length ? (
              <div className="divide-y divide-slate-100">
                {groups.map((g) => (
                  <section key={g.week ?? "none"} aria-label={weekLabel(g.week, weeks)}>
                    <h3 className="flex items-center gap-2 bg-slate-50 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:px-6">
                      {weekLabel(g.week, weeks)}
                      {g.week && g.week === current ? <Badge tone="blue">This week</Badge> : null}
                    </h3>
                    <ul className="divide-y divide-slate-100">
                      {g.items.map((n) => (
                        <li key={n.id}>
                          <a
                            href={`${PATH}/${n.id}`}
                            className="flex items-center gap-3 px-5 py-3.5 transition hover:bg-slate-50 active:bg-slate-100 sm:px-6"
                          >
                            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-700">
                              <FileText className="h-5 w-5" aria-hidden="true" />
                            </span>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold text-slate-900">{n.topic}</span>
                                <Badge tone={n.status === "published" ? "green" : "gold"} dot>
                                  {n.status === "published" ? "Published" : "Draft"}
                                </Badge>
                              </div>
                              <div className="mt-0.5 text-sm text-slate-500">
                                {n.subject_id ? subjectName.get(n.subject_id) ?? "Subject" : "General"}
                                {n.file_path ? ` · ${fileKind(n.file_type, n.file_name)}` : ""}
                                {n.body ? " · typed notes" : ""}
                                {!n.file_path && !n.body ? " · nothing added yet" : ""}
                                {n.author_name ? ` · ${n.author_name}` : ""} ·{" "}
                                {n.status === "published" && n.published_at ? `published ${formatLagosDate(n.published_at)}` : `saved ${formatLagosDate(n.updated_at)}`}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={BookOpenText}
                title={allNotes.length ? "No notes match" : "No lesson notes for this class and term yet"}
                description={allNotes.length ? "Try another subject, or show all notes." : canWrite ? "Start the first one below." : "Notes appear here once a teacher adds them."}
              />
            )}
          </Card>

          <Card id="new">
            <CardHeader
              title="New lesson note"
              description={`For ${cls?.name ?? "this class"}, ${term ? termLabel(term) : "this term"}. It's saved as a draft first: only staff can see it until you publish.`}
            />
            {!termId ? (
              <CardBody>
                <Alert tone="warning">No terms have been set up yet. Ask an admin to add them under Finance → Academic years.</Alert>
              </CardBody>
            ) : canWrite ? (
              <form action={createNote} className="space-y-4 px-5 pb-5 sm:px-6">
                <input type="hidden" name="class_id" value={classId} />
                <input type="hidden" name="term_id" value={termId} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="new-subject" className="gf-label">
                      Subject
                    </label>
                    <select
                      id="new-subject"
                      name="subject_id"
                      required
                      defaultValue={subjectFilter && (subjectFilter === "none" ? canWriteGeneral : subjectName.has(subjectFilter)) ? subjectFilter : ""}
                      className="gf-select"
                    >
                      <option value="" disabled>
                        Choose…
                      </option>
                      {subjectOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      {canWriteGeneral ? <option value="none">General (no subject)</option> : null}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="new-week" className="gf-label">
                      Week
                    </label>
                    <select id="new-week" name="week" defaultValue={current ? String(current) : ""} className="gf-select">
                      <option value="">No particular week</option>
                      {weeks.map((w) => (
                        <option key={w.number} value={w.number}>
                          {w.label}
                          {w.number === current ? " (this week)" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="new-topic" className="gf-label">
                    Topic
                  </label>
                  <input id="new-topic" name="topic" required minLength={2} maxLength={160} className="gf-input" placeholder="e.g. Fractions: adding and subtracting" />
                </div>
                <SubmitButton pendingText="Saving…">
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Create and add the notes
                  </span>
                </SubmitButton>
              </form>
            ) : (
              <CardBody>
                <EmptyState icon={BookOpenText} title="No subjects you teach in this class" description="Ask an admin to assign you a subject in this class (Teacher assignments)." />
              </CardBody>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
