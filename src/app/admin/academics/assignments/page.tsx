import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ClipboardList, NotebookPen, Plus } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { canTeach, getTeacherAccess } from "@/lib/teacher-access";
import { firstOrNull } from "@/lib/relations";
import {
  ASSIGNMENT_COLUMNS,
  KIND_LABEL,
  assignmentErrorMessage,
  dueLabel,
  lagosDueAt,
  type AssignmentRow
} from "@/lib/assignments";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { LEARN } from "@/lib/learn-guides";
import { cn } from "@/lib/cn";

// Teachers set assignments and classwork for their classes; pupils hand in on the portal (see lib/assignments.ts).

const PATH = "/admin/academics/assignments";

type ClassRow = { id: string; level: string; name: string };

function back(classId: string, message: string, type: "success" | "error" = "success"): never {
  redirect(`${PATH}?class_id=${encodeURIComponent(classId)}&toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

async function createAssignment(formData: FormData) {
  "use server";
  const classId = String(formData.get("class_id") ?? "").trim();
  const subjectRaw = String(formData.get("subject_id") ?? "").trim();
  const subjectId = subjectRaw && subjectRaw !== "none" ? subjectRaw : null;
  const kind = String(formData.get("kind") ?? "assignment") === "classwork" ? "classwork" : "assignment";
  const title = String(formData.get("title") ?? "").trim().replace(/\s+/g, " ");
  const instructions = String(formData.get("instructions") ?? "").trim();
  const dueAt = lagosDueAt(String(formData.get("due_date") ?? ""), String(formData.get("due_time") ?? ""));
  const maxRaw = String(formData.get("max_score") ?? "").trim();
  const maxScore = maxRaw ? Number(maxRaw) : null;
  const acceptsLate = formData.get("accepts_late") === "on";

  if (!classId) back(classId, "Choose a class first", "error");
  if (!subjectRaw) back(classId, "Choose the subject", "error");
  if (title.length < 2) back(classId, "Give it a title", "error");
  if (maxScore !== null && (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000)) back(classId, "The marks must be a number above 0", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back(classId, "Server error — please try again later.", "error");
  const { data: term } = await supabase.from("academic_terms").select("id").eq("is_active", true).limit(1).maybeSingle();

  const { data, error } = await supabase
    .from("assignments")
    .insert({
      class_id: classId,
      subject_id: subjectId,
      academic_term_id: (term as { id: string } | null)?.id ?? null,
      kind,
      title,
      instructions: instructions || null,
      due_at: dueAt,
      max_score: maxScore,
      accepts_late: acceptsLate
    })
    .select("id")
    .single();
  if (error || !data) back(classId, assignmentErrorMessage(error?.message ?? "Couldn't save"), "error");
  revalidatePath(PATH);
  revalidatePath("/portal/assignments");
  redirect(`${PATH}/${(data as { id: string }).id}?toast=${encodeURIComponent(`${KIND_LABEL[kind]} set. Add a worksheet if you have one; pupils can see it now.`)}&toast_type=success`);
}

export default async function AssignmentsPage({
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

  const [{ data: offered }, { data: assignmentData, error: tableError }, { data: pupils }] = classId
    ? await Promise.all([
        supabase.from("class_subjects").select("subject_id, subjects(id, name)").eq("class_id", classId),
        supabase.from("assignments").select(ASSIGNMENT_COLUMNS).eq("class_id", classId).order("created_at", { ascending: false }).limit(100),
        supabase.from("students").select("id").eq("class_id", classId)
      ])
    : [{ data: [] }, { data: [], error: null }, { data: [] }];

  const subjectOptions = ((offered ?? []) as Array<{ subject_id: string; subjects: { id: string; name: string } | { id: string; name: string }[] | null }>)
    .map((o) => firstOrNull(o.subjects))
    .filter((s): s is { id: string; name: string } => Boolean(s))
    .filter((s) => canTeach(access, classId, s.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const canSetGeneral = !access.isTeacher || access.classTeacherClassIds.includes(classId);
  const subjectName = new Map(subjectOptions.map((s) => [s.id, s.name] as const));

  const assignments = (assignmentData ?? []) as AssignmentRow[];
  const pupilCount = (pupils ?? []).length;
  const ids = assignments.map((a) => a.id);
  const { data: subs } = ids.length
    ? await supabase.from("assignment_submissions").select("assignment_id, submitted_at, marked_at").in("assignment_id", ids)
    : { data: [] };
  const counts = new Map<string, { handedIn: number; marked: number }>();
  for (const s of (subs ?? []) as Array<{ assignment_id: string; submitted_at: string | null; marked_at: string | null }>) {
    const c = counts.get(s.assignment_id) ?? { handedIn: 0, marked: 0 };
    if (s.submitted_at) c.handedIn += 1;
    if (s.marked_at) c.marked += 1;
    counts.set(s.assignment_id, c);
  }
  // Subject names for assignments whose subject the teacher no longer sees in the list.
  const missingSubjects = Array.from(new Set(assignments.map((a) => a.subject_id).filter((s): s is string => Boolean(s) && !subjectName.has(s!))));
  if (missingSubjects.length) {
    const { data } = await supabase.from("subjects").select("id, name").in("id", missingSubjects);
    for (const s of (data ?? []) as Array<{ id: string; name: string }>) subjectName.set(s.id, s.name);
  }
  const now = new Date();

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.assignments}
        eyebrow="Academics"
        title="Assignments & classwork"
        description="Set work for a class. Pupils see it on the portal and hand it in by typing an answer or uploading a photo of their work; you mark it here, and can send the marks to the result sheet."
      />

      {tableError ? (
        <Alert tone="warning">This needs a database update first. Ask the school&apos;s IT person to run 20261105_assignments.sql.</Alert>
      ) : null}

      {!classes.length ? (
        <Alert tone="warning">No classes are assigned to you yet. Ask an admin to assign you to a class or subject (Teacher assignments).</Alert>
      ) : (
        <>
          <Card>
            <CardBody>
              <form method="get" action={PATH} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="min-w-0 flex-1">
                  <label htmlFor="as-class" className="gf-label">
                    Class
                  </label>
                  <select id="as-class" name="class_id" defaultValue={classId} className="gf-select">
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

          <Card>
            <CardHeader title={`${cls?.name ?? "Class"} · work set`} description={`${pupilCount} pupil${pupilCount === 1 ? "" : "s"} in the class.`} />
            {assignments.length ? (
              <ul className="gf-stagger divide-y divide-slate-100">
                {assignments.map((a) => {
                  const c = counts.get(a.id) ?? { handedIn: 0, marked: 0 };
                  const overdue = a.due_at && now > new Date(a.due_at);
                  return (
                    <li key={a.id}>
                      <a href={`${PATH}/${a.id}`} className="flex flex-col gap-2 px-5 py-4 transition hover:bg-slate-50 active:bg-slate-100 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-slate-900">{a.title}</span>
                            <Badge tone={a.kind === "classwork" ? "blue" : "slate"}>{KIND_LABEL[a.kind]}</Badge>
                          </div>
                          <div className="mt-0.5 text-sm text-slate-500">
                            {a.subject_id ? subjectName.get(a.subject_id) ?? "Subject" : "General"} ·{" "}
                            <span className={cn(overdue && "text-slate-700")}>{dueLabel(a.due_at)}</span>
                            {a.max_score ? ` · out of ${Number(a.max_score)}` : ""}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2 text-xs">
                          <Badge tone={c.handedIn >= pupilCount && pupilCount ? "green" : "slate"}>
                            {c.handedIn}/{pupilCount} handed in
                          </Badge>
                          <Badge tone={c.marked >= pupilCount && pupilCount ? "green" : c.marked ? "gold" : "slate"}>{c.marked} marked</Badge>
                        </div>
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon={NotebookPen} title="No work set for this class yet" description="Set the first assignment or classwork below." />
            )}
          </Card>

          <Card id="new">
            <CardHeader title="Set new work" description="Pupils of this class (and their parents) see it on the portal straight away." />
            {subjectOptions.length || canSetGeneral ? (
              <form action={createAssignment} className="space-y-4 px-5 pb-5 sm:px-6">
                <input type="hidden" name="class_id" value={classId} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="as-subject" className="gf-label">
                      Subject
                    </label>
                    <select id="as-subject" name="subject_id" required defaultValue="" className="gf-select">
                      <option value="" disabled>
                        Choose…
                      </option>
                      {subjectOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      {canSetGeneral ? <option value="none">General (no subject)</option> : null}
                    </select>
                  </div>
                  <div>
                    <span className="gf-label">Type</span>
                    <div className="grid grid-cols-2 gap-2">
                      {(["assignment", "classwork"] as const).map((k) => (
                        <label key={k} className="cursor-pointer">
                          <input type="radio" name="kind" value={k} defaultChecked={k === "assignment"} className="peer sr-only" />
                          <span className="flex h-11 items-center justify-center rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 transition peer-checked:border-brand-green-500 peer-checked:bg-brand-green-50 peer-checked:text-brand-green-800 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-green-500/20">
                            {KIND_LABEL[k]}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
                <div>
                  <label htmlFor="as-title" className="gf-label">
                    Title
                  </label>
                  <input id="as-title" name="title" required minLength={2} maxLength={160} className="gf-input" placeholder="e.g. Fractions worksheet, page 24" />
                </div>
                <div>
                  <label htmlFor="as-instructions" className="gf-label">
                    Instructions
                  </label>
                  <textarea
                    id="as-instructions"
                    name="instructions"
                    rows={5}
                    maxLength={20000}
                    className="gf-input"
                    placeholder="What to do, and how to hand it in (type the answers, or take a clear photo of your exercise book)."
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div>
                    <label htmlFor="as-due-date" className="gf-label">
                      Due date
                    </label>
                    <input id="as-due-date" name="due_date" type="date" className="gf-input" />
                  </div>
                  <div>
                    <label htmlFor="as-due-time" className="gf-label">
                      Due time
                    </label>
                    <input id="as-due-time" name="due_time" type="time" defaultValue="16:00" className="gf-input" />
                  </div>
                  <div>
                    <label htmlFor="as-max" className="gf-label">
                      Marks
                    </label>
                    <input id="as-max" name="max_score" type="number" min={1} max={1000} step="0.5" inputMode="decimal" className="gf-input" placeholder="e.g. 20" />
                  </div>
                </div>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input type="checkbox" name="accepts_late" defaultChecked className="h-5 w-5 rounded border-slate-300 text-brand-green focus:ring-brand-green-500" />
                  Accept work handed in after the due date (it is marked as late)
                </label>
                <SubmitButton pendingText="Saving…">
                  <span className="inline-flex items-center gap-2">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Set this work
                  </span>
                </SubmitButton>
              </form>
            ) : (
              <CardBody>
                <EmptyState icon={ClipboardList} title="No subjects you teach in this class" description="Ask an admin to assign you a subject in this class." />
              </CardBody>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
