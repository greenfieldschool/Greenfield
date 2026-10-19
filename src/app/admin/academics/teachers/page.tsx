import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { BookOpen, School, UserCheck, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import TeacherAssignForm from "./TeacherAssignForm";

type TeacherRow = { id: string; full_name: string | null; email: string | null };
type ClassRow = { id: string; level: string; name: string };
type SubjectRow = { id: string; name: string };
type ClassAssignment = { teacher_id: string; class_id: string };
type SubjectAssignment = { teacher_id: string; class_id: string; subject_id: string };

const PATH = "/admin/academics/teachers";
const levelOrder: Record<string, number> = { creche: 0, primary: 1, secondary: 2 };
const MIGRATION_MISSING =
  "Subject assignments are not set up in the database yet. Run docs/migrations/20261019_teacher_subject_assignments.sql in Supabase.";

// Server actions live at module level so they cannot accidentally capture values from the page render.

function back(message: string, type: "success" | "error" = "success"): never {
  revalidatePath(PATH);
  revalidatePath("/admin/users");
  revalidatePath("/admin/academics/results");
  revalidatePath("/admin/academics/assessments");
  revalidatePath("/admin/exams/tests");
  redirect(`${PATH}?${new URLSearchParams({ toast: message, toast_type: type }).toString()}`);
}

function explain(message: string) {
  return /teacher_subject_assignments|schema cache/i.test(message) ? MIGRATION_MISSING : message;
}

async function adminClient() {
  const supabase = getSupabaseServerClient();
  if (!supabase) back("Database is not configured", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/admin/login");
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (me as { role?: string } | null)?.role;
  if (role !== "super_admin" && role !== "admin") back("Only admins can assign teachers", "error");
  return supabase;
}

function ids(formData: FormData, key: string) {
  return Array.from(new Set(formData.getAll(key).map((v) => String(v).trim()).filter(Boolean)));
}

async function assignTeacher(formData: FormData) {
  "use server";

  const teacherId = String(formData.get("teacher_id") ?? "").trim();
  const mode = String(formData.get("mode") ?? "class").trim();
  const classIds = ids(formData, "class_id");
  const subjectIds = ids(formData, "subject_id");

  if (!teacherId) back("Choose a teacher", "error");
  if (!classIds.length) back("Tick at least one class", "error");
  if (mode === "subjects" && !subjectIds.length) back("Tick at least one subject", "error");

  const supabase = await adminClient();

  if (mode === "subjects") {
    const rows = classIds.flatMap((class_id) =>
      subjectIds.map((subject_id) => ({ teacher_id: teacherId, class_id, subject_id, active: true }))
    );
    const { error } = await supabase
      .from("teacher_subject_assignments")
      .upsert(rows, { onConflict: "teacher_id,class_id,subject_id" });
    if (error) back(explain(error.message), "error");
    back(
      `Assigned ${subjectIds.length} subject${subjectIds.length === 1 ? "" : "s"} in ${classIds.length} class${
        classIds.length === 1 ? "" : "es"
      } (${rows.length} assignments)`
    );
  }

  const { error } = await supabase
    .from("teacher_class_assignments")
    .upsert(
      classIds.map((class_id) => ({ teacher_id: teacherId, class_id, active: true })),
      { onConflict: "teacher_id,class_id" }
    );
  if (error) back(explain(error.message), "error");
  back(`Assigned as class teacher of ${classIds.length} class${classIds.length === 1 ? "" : "es"}`);
}

async function removeClassTeacher(formData: FormData) {
  "use server";
  const teacherId = String(formData.get("teacher_id") ?? "").trim();
  const classId = String(formData.get("class_id") ?? "").trim();
  if (!teacherId || !classId) back("Missing teacher or class", "error");

  const supabase = await adminClient();
  const { error } = await supabase
    .from("teacher_class_assignments")
    .delete()
    .eq("teacher_id", teacherId)
    .eq("class_id", classId);
  if (error) back(error.message, "error");
  back("Class teacher assignment removed");
}

async function removeSubjectAssignment(formData: FormData) {
  "use server";
  const teacherId = String(formData.get("teacher_id") ?? "").trim();
  const subjectId = String(formData.get("subject_id") ?? "").trim();
  const classId = String(formData.get("class_id") ?? "").trim(); // empty = every class
  if (!teacherId || !subjectId) back("Missing teacher or subject", "error");

  const supabase = await adminClient();
  let query = supabase.from("teacher_subject_assignments").delete().eq("teacher_id", teacherId).eq("subject_id", subjectId);
  if (classId) query = query.eq("class_id", classId);
  const { error } = await query;
  if (error) back(explain(error.message), "error");
  back(classId ? "Subject assignment removed" : "Subject removed from all of this teacher's classes");
}

const chip =
  "inline-flex items-center gap-1 rounded-lg bg-slate-100 py-1 pl-2.5 pr-1 text-xs font-medium text-slate-700";

function RemoveButton({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="inline-flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
      aria-label={label}
      title={label}
    >
      <X className="h-3.5 w-3.5" aria-hidden="true" />
    </button>
  );
}

export default async function AdminTeacherAssignmentsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [
    { data: teacherData },
    { data: classData },
    { data: subjectData },
    { data: classAssignData },
    { data: subjectAssignData, error: subjectAssignError }
  ] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email").eq("role", "teacher").order("full_name", { ascending: true }),
    supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
    supabase.from("subjects").select("id, name").eq("active", true).order("name"),
    supabase.from("teacher_class_assignments").select("teacher_id, class_id").eq("active", true),
    supabase.from("teacher_subject_assignments").select("teacher_id, class_id, subject_id").eq("active", true)
  ]);

  const teachers = (teacherData ?? []) as TeacherRow[];
  const classes = ((classData ?? []) as ClassRow[]).sort(
    (a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9) || a.name.localeCompare(b.name)
  );
  const subjects = (subjectData ?? []) as SubjectRow[];
  const classAssignments = (classAssignData ?? []) as ClassAssignment[];
  const subjectAssignments = (subjectAssignData ?? []) as SubjectAssignment[];

  const classById = new Map(classes.map((c) => [c.id, c] as const));
  const subjectById = new Map(subjects.map((s) => [s.id, s] as const));
  const classLabel = (id: string) => {
    const c = classById.get(id);
    return c ? c.name : "Inactive class";
  };

  const levels = Array.from(new Set(classes.map((c) => c.level)));
  const classGroups = levels.map((level) => ({
    level,
    items: classes.filter((c) => c.level === level).map((c) => ({ id: c.id, label: c.name }))
  }));

  const teacherName = (t: TeacherRow) => t.full_name?.trim() || t.email || t.id;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Academics"
        title="Teacher assignments"
        description="Choose which classes and subjects each teacher works on. Teachers only see their own classes and subjects when entering results and setting CBT questions."
        actions={
          <>
            <ButtonLink href="/admin/academics/class-subjects" variant="secondary">
              <School className="h-4 w-4" aria-hidden="true" />
              Class subjects
            </ButtonLink>
            <ButtonLink href="/admin/users" variant="secondary">
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              Staff &amp; users
            </ButtonLink>
          </>
        }
      />

      {subjectAssignError ? (
        <Alert tone="danger" title="Subject assignments are not set up in the database yet">
          Run docs/migrations/20261019_teacher_subject_assignments.sql in Supabase, then reload. Class teacher assignments
          still work meanwhile.
        </Alert>
      ) : null}

      <Alert tone="info" title="How assignments work">
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>
            <strong className="font-semibold">Class teacher</strong>: tick one or many classes (e.g. Creche, Playgroup and
            Preparatory for one person). They get the class&apos;s students, attendance and every subject the class takes.
          </li>
          <li>
            <strong className="font-semibold">Subject teacher</strong>: tick the classes and the subjects (e.g. Year 2 to 4
            with IRS and Arabic, or French in every class). They only work on those subjects.
          </li>
          <li>A teacher can be both: class teacher of Year 1 and the French teacher in all classes.</li>
        </ul>
      </Alert>

      <Card>
        <CardHeader title="Assign a teacher" description="Add classes and subjects to a teacher. Existing assignments are kept." />
        <CardBody>
          {teachers.length && classes.length ? (
            <TeacherAssignForm
              action={assignTeacher}
              teachers={teachers.map((t) => ({ id: t.id, label: teacherName(t) }))}
              classGroups={classGroups}
              subjects={subjects.map((s) => ({ id: s.id, label: s.name }))}
            />
          ) : (
            <EmptyState
              icon={UserCheck}
              title={teachers.length ? "No active classes yet" : "No teachers yet"}
              description={
                teachers.length
                  ? "Create classes under Finance → Fees → Classes first."
                  : "Invite staff and give them the Teacher role under Staff & users."
              }
            />
          )}
        </CardBody>
      </Card>

      <section aria-labelledby="assignments-heading" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="assignments-heading" className="text-base font-semibold text-slate-900">
            Current assignments
          </h2>
          <span className="text-sm text-slate-500">
            {teachers.length} teacher{teachers.length === 1 ? "" : "s"}
          </span>
        </div>

        {teachers.map((t) => {
          const mine = classAssignments.filter((a) => a.teacher_id === t.id);
          const mineSubjects = subjectAssignments.filter((a) => a.teacher_id === t.id);
          const bySubject = new Map<string, SubjectAssignment[]>();
          for (const a of mineSubjects) bySubject.set(a.subject_id, [...(bySubject.get(a.subject_id) ?? []), a]);
          const subjectGroups = Array.from(bySubject.entries()).sort(
            (a, b) => (subjectById.get(a[0])?.name ?? "").localeCompare(subjectById.get(b[0])?.name ?? "")
          );
          const empty = !mine.length && !subjectGroups.length;

          return (
            <Card key={t.id}>
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3.5 sm:px-6">
                <span className="font-semibold text-slate-900">{teacherName(t)}</span>
                {t.email && t.full_name ? <span className="text-xs text-slate-500">{t.email}</span> : null}
                {empty ? <Badge tone="gold">Nothing assigned</Badge> : null}
              </div>
              {!empty ? (
                <div className="space-y-4 px-5 py-4 sm:px-6">
                  {mine.length ? (
                    <div className="flex flex-wrap items-start gap-3">
                      <div className="flex w-36 shrink-0 items-center gap-2 pt-1 text-sm font-medium text-slate-700">
                        <School className="h-4 w-4 text-slate-400" aria-hidden="true" />
                        Class teacher
                      </div>
                      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
                        {mine.map((a) => (
                          <form key={a.class_id} action={removeClassTeacher} className={chip}>
                            <input type="hidden" name="teacher_id" value={a.teacher_id} />
                            <input type="hidden" name="class_id" value={a.class_id} />
                            <span>{classLabel(a.class_id)}</span>
                            <RemoveButton label={`Remove ${t.full_name ?? "teacher"} from ${classLabel(a.class_id)}`} />
                          </form>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {subjectGroups.map(([subjectId, rows]) => (
                    <div key={subjectId} className="flex flex-wrap items-start gap-3">
                      <div className="flex w-36 shrink-0 items-center gap-2 pt-1 text-sm font-medium text-slate-700">
                        <BookOpen className="h-4 w-4 text-slate-400" aria-hidden="true" />
                        <span className="truncate">{subjectById.get(subjectId)?.name ?? "Inactive subject"}</span>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        {rows
                          .sort((a, b) => {
                            const ca = classById.get(a.class_id);
                            const cb = classById.get(b.class_id);
                            return (
                              (levelOrder[ca?.level ?? ""] ?? 9) - (levelOrder[cb?.level ?? ""] ?? 9) ||
                              (ca?.name ?? "").localeCompare(cb?.name ?? "")
                            );
                          })
                          .map((a) => (
                            <form key={a.class_id} action={removeSubjectAssignment} className={chip}>
                              <input type="hidden" name="teacher_id" value={a.teacher_id} />
                              <input type="hidden" name="subject_id" value={a.subject_id} />
                              <input type="hidden" name="class_id" value={a.class_id} />
                              <span>{classLabel(a.class_id)}</span>
                              <RemoveButton label={`Remove ${subjectById.get(subjectId)?.name ?? "subject"} from ${classLabel(a.class_id)}`} />
                            </form>
                          ))}
                        {rows.length > 1 ? (
                          <form action={removeSubjectAssignment}>
                            <input type="hidden" name="teacher_id" value={t.id} />
                            <input type="hidden" name="subject_id" value={subjectId} />
                            <SubmitButton
                              className="text-xs font-semibold text-red-600 hover:underline"
                              pendingText="Removing…"
                              showSpinner={false}
                            >
                              Remove from all classes
                            </SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          );
        })}

        {!teachers.length ? (
          <Card>
            <EmptyState icon={UserCheck} title="No teachers yet." description="Give staff the Teacher role under Staff & users." />
          </Card>
        ) : null}
      </section>

      <p className="text-xs text-slate-500">
        Subjects a class takes are set under{" "}
        <Link className="gf-link" href="/admin/academics/class-subjects">
          Class subjects
        </Link>
        . A class teacher gets exactly those subjects.
      </p>
    </div>
  );
}
