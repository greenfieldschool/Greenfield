import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { BookOpen, Copy, MousePointerClick, School } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type ClassRow = { id: string; level: string; name: string };
type SubjectRow = { id: string; name: string; level: string | null; active: boolean };
type AssignmentRow = { class_id: string; subject_id: string };

// Server actions live at module level so they cannot accidentally capture values from the page render.

function back(classId: string, message: string, type: "success" | "error" = "success"): never {
  revalidatePath("/admin/academics/class-subjects");
  revalidatePath("/admin/academics/subjects");
  revalidatePath("/admin/academics/results");
  const params = new URLSearchParams({ toast: message, toast_type: type });
  if (classId) params.set("class_id", classId);
  redirect(`/admin/academics/class-subjects?${params.toString()}`);
}

async function saveClassSubjects(formData: FormData) {
  "use server";

  const classId = String(formData.get("class_id") ?? "").trim();
  if (!classId) back("", "Choose a class first", "error");
  const wanted = new Set(
    formData
      .getAll("subject_id")
      .map((v) => String(v).trim())
      .filter(Boolean)
  );

  const supabase = getSupabaseServerClient();
  if (!supabase) back(classId, "Database is not configured", "error");

  const { data: current, error: readError } = await supabase
    .from("class_subjects")
    .select("subject_id")
    .eq("class_id", classId);
  if (readError) back(classId, readError.message, "error");

  const have = new Set(((current ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id));
  const toAdd = Array.from(wanted).filter((id) => !have.has(id));
  const toRemove = Array.from(have).filter((id) => !wanted.has(id));

  if (toAdd.length) {
    const { error } = await supabase
      .from("class_subjects")
      .upsert(
        toAdd.map((subject_id) => ({ class_id: classId, subject_id })),
        { onConflict: "class_id,subject_id", ignoreDuplicates: true }
      );
    if (error) back(classId, error.message, "error");
  }
  if (toRemove.length) {
    const { error } = await supabase
      .from("class_subjects")
      .delete()
      .eq("class_id", classId)
      .in("subject_id", toRemove);
    if (error) back(classId, error.message, "error");
  }

  back(classId, `Saved ${wanted.size} subject(s) for this class`);
}

async function copyFromClass(formData: FormData) {
  "use server";

  const classId = String(formData.get("class_id") ?? "").trim();
  const fromClassId = String(formData.get("from_class_id") ?? "").trim();
  if (!classId) back("", "Choose a class first", "error");
  if (!fromClassId || fromClassId === classId) back(classId, "Choose another class to copy from", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back(classId, "Database is not configured", "error");

  const { data: source } = await supabase.from("class_subjects").select("subject_id").eq("class_id", fromClassId);
  const rows = ((source ?? []) as Array<{ subject_id: string }>).map((r) => ({
    class_id: classId,
    subject_id: r.subject_id
  }));
  if (!rows.length) back(classId, "That class has no subjects assigned yet", "error");

  const { error } = await supabase
    .from("class_subjects")
    .upsert(rows, { onConflict: "class_id,subject_id", ignoreDuplicates: true });
  if (error) back(classId, error.message, "error");

  back(classId, `Added ${rows.length} subject(s) from the other class`);
}

export default async function AdminClassSubjectsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const classId = typeof sp.class_id === "string" ? sp.class_id.trim() : "";

  const [{ data: classes }, { data: subjects }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
    supabase.from("subjects").select("id, name, level, active").order("name"),
    supabase.from("class_subjects").select("class_id, subject_id")
  ]);

  const classRows = (classes ?? []) as ClassRow[];
  const subjectRows = (subjects ?? []) as SubjectRow[];
  const assignmentRows = (assignments ?? []) as AssignmentRow[];

  const countByClass = new Map<string, number>();
  for (const a of assignmentRows) countByClass.set(a.class_id, (countByClass.get(a.class_id) ?? 0) + 1);

  const cls = classRows.find((c) => c.id === classId) ?? null;
  const assigned = new Set(assignmentRows.filter((a) => a.class_id === classId).map((a) => a.subject_id));
  // Inactive subjects are only listed if the class still has them, so they can be unticked.
  const selectable = subjectRows.filter((s) => s.active || assigned.has(s.id));
  // Subjects tied to a different level than the class are listed last.
  const forLevel = selectable.filter((s) => !cls || !s.level || s.level === cls.level);
  const otherLevel = selectable.filter((s) => cls && s.level && s.level !== cls.level);

  const subjectCheckbox = (s: SubjectRow) => (
    <label
      key={s.id}
      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm transition hover:border-slate-300 hover:bg-slate-50 has-[:checked]:border-brand-green-300 has-[:checked]:bg-brand-green-50"
    >
      <input className="gf-checkbox" type="checkbox" name="subject_id" value={s.id} defaultChecked={assigned.has(s.id)} />
      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{s.name}</span>
      {s.level ? <span className="text-xs text-slate-500">{s.level}</span> : null}
      {!s.active ? <Badge tone="gold">inactive</Badge> : null}
    </label>
  );

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Academics"
        title="Class subjects"
        description={
          <>
            Choose the subjects each class takes. The result sheet only offers a class&apos;s own subjects, so teachers
            can&apos;t enter results under the wrong or duplicate subject. New subjects are added on the{" "}
            <Link className="gf-link" href="/admin/academics/subjects">
              Subjects
            </Link>{" "}
            page.
          </>
        }
        actions={
          <ButtonLink href="/admin/academics/subjects" variant="secondary">
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Manage subjects
          </ButtonLink>
        }
      />

      {assignmentsError ? (
        <Alert tone="danger" title="Class subjects are not set up in the database yet">
          Run docs/migrations/20261009_subject_management.sql in Supabase. ({assignmentsError.message})
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="h-fit lg:sticky lg:top-24">
          <CardHeader title="Classes" description={`${classRows.length} active`} />
          {classRows.length ? (
            <nav aria-label="Classes" className="max-h-[70vh] divide-y divide-slate-100 overflow-y-auto">
              {classRows.map((c) => {
                const n = countByClass.get(c.id) ?? 0;
                const isSelected = c.id === classId;
                return (
                  <Link
                    key={c.id}
                    href={`/admin/academics/class-subjects?class_id=${c.id}`}
                    aria-current={isSelected ? "page" : undefined}
                    className={cn(
                      "flex items-center justify-between gap-3 border-l-2 px-5 py-3 text-sm transition last:rounded-b-2xl sm:px-6",
                      isSelected
                        ? "border-l-brand-green bg-brand-green-50 font-semibold text-slate-900"
                        : "border-l-transparent text-slate-700 hover:bg-slate-50"
                    )}
                  >
                    <span className="min-w-0 truncate">
                      {c.level} - {c.name}
                    </span>
                    {n ? (
                      <Badge tone="slate">{`${n} subject${n === 1 ? "" : "s"}`}</Badge>
                    ) : (
                      <Badge tone="gold">none yet</Badge>
                    )}
                  </Link>
                );
              })}
            </nav>
          ) : (
            <EmptyState icon={School} title="No active classes" />
          )}
        </Card>

        <div className="space-y-6 lg:col-span-2">
          {cls ? (
            <>
              <form action={saveClassSubjects}>
                <input type="hidden" name="class_id" value={cls.id} />
                <FormSection
                  title={`${cls.level} - ${cls.name}`}
                  description="Tick every subject this class takes, then save."
                  footer={
                    <SubmitButton variant="primary" pendingText="Saving…">
                      Save subjects
                    </SubmitButton>
                  }
                >
                  {selectable.length ? (
                    <div className="space-y-6">
                      <div className="grid gap-2 sm:grid-cols-2">{forLevel.map(subjectCheckbox)}</div>
                      {otherLevel.length ? (
                        <div>
                          <div className="text-xs font-medium text-slate-500">Subjects set to another level</div>
                          <div className="mt-2 grid gap-2 sm:grid-cols-2">{otherLevel.map(subjectCheckbox)}</div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <EmptyState
                      icon={BookOpen}
                      title="No active subjects"
                      description="No active subjects. Add some on the Subjects page first."
                    />
                  )}
                </FormSection>
              </form>

              <form action={copyFromClass}>
                <input type="hidden" name="class_id" value={cls.id} />
                <FormSection
                  title="Copy subjects from another class"
                  description="Adds that class's subjects to this one. Nothing is removed."
                  footer={
                    <SubmitButton variant="secondary" pendingText="Copying…">
                      <span className="inline-flex items-center gap-2">
                        <Copy className="h-4 w-4" aria-hidden="true" />
                        Copy subjects
                      </span>
                    </SubmitButton>
                  }
                >
                  <Field label="Copy from" htmlFor="copy-from-class">
                    <select id="copy-from-class" className="gf-select" name="from_class_id" defaultValue="" required>
                      <option value="">Select class</option>
                      {classRows
                        .filter((c) => c.id !== cls.id && (countByClass.get(c.id) ?? 0) > 0)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.level} - {c.name} ({countByClass.get(c.id)} subjects)
                          </option>
                        ))}
                    </select>
                  </Field>
                </FormSection>
              </form>
            </>
          ) : (
            <Card>
              <EmptyState
                icon={MousePointerClick}
                title="Pick a class"
                description="Pick a class on the left to choose its subjects."
              />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
