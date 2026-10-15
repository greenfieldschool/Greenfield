import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { firstOrNull } from "@/lib/relations";
import { ChevronRight, ClipboardList, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";

type YearRow = { id: string; name: string };
type TermRow = { id: string; name: string };
type ClassRow = { id: string; level: string; name: string };
type SubjectRow = { id: string; name: string };

type AssessmentRow = {
  id: string;
  assessment_type: string;
  title: string | null;
  held_on: string | null;
  max_score: number;
  subjects: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; level: string; name: string }>;
  academic_years: Array<{ id: string; name: string }>;
  academic_terms: Array<{ id: string; name: string }>;
};

const assessmentTypes = [
  "weekly_test",
  "mid_term",
  "exam",
  "mock",
  "assignment",
  "first_ca",
  "second_ca",
  "exam_objective",
  "exam_theory"
] as const;

export default async function AdminAssessmentsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null as unknown };

  const role = (profile as { role?: string } | null)?.role ?? null;
  const isTeacher = role === "teacher";

  const [{ data: years }, { data: terms }, { data: teacherClasses }, { data: classes }, { data: subjects }, { data: assessments }] =
    await Promise.all([
      supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
      supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false }),
      isTeacher && user
        ? supabase
            .from("teacher_class_assignments")
            .select("class_id, classes(id, level, name)")
            .eq("teacher_id", user.id)
            .eq("active", true)
        : Promise.resolve({ data: [] as unknown[] }),
      !isTeacher
        ? supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name")
        : Promise.resolve({ data: [] as unknown[] }),
      supabase.from("subjects").select("id, name").eq("active", true).order("name"),
      supabase
        .from("academic_assessments")
        .select(
          "id, assessment_type, title, held_on, max_score, subjects(id, name), classes(id, level, name), academic_years(id, name), academic_terms(id, name)"
        )
        .order("held_on", { ascending: false })
        .limit(200)
    ]);

  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const teacherClassRows = (teacherClasses ?? []) as Array<{ classes: ClassRow | ClassRow[] | null }>;
  const classRows = isTeacher
    ? teacherClassRows.map((r) => firstOrNull(r.classes)).filter((c): c is ClassRow => Boolean(c))
    : ((classes ?? []) as ClassRow[]);
  const subjectRows = (subjects ?? []) as SubjectRow[];
  const assessmentRows = (assessments ?? []) as unknown as AssessmentRow[];

  const hasAnyClass = classRows.length > 0;

  async function createAssessment(formData: FormData) {
    "use server";

    const academicYearId = String(formData.get("academic_year_id") ?? "").trim();
    const academicTermId = String(formData.get("academic_term_id") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();
    const subjectId = String(formData.get("subject_id") ?? "").trim();
    const assessmentType = String(formData.get("assessment_type") ?? "").trim();
    const title = String(formData.get("title") ?? "").trim();
    const maxScore = Number(String(formData.get("max_score") ?? "100").trim() || "100");
    const heldOn = String(formData.get("held_on") ?? "").trim();

    if (!classId || !subjectId || !assessmentType) {
      redirect(`/admin/academics/assessments?toast=${encodeURIComponent("Choose a class, subject and type")}&toast_type=error`);
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      redirect(`/admin/academics/assessments?toast=${encodeURIComponent("Max score must be greater than 0")}&toast_type=error`);
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) {
      redirect(`/admin/academics/assessments?toast=${encodeURIComponent("Database is not configured")}&toast_type=error`);
    }

    const { error } = await supabase.from("academic_assessments").insert({
      academic_year_id: academicYearId.length ? academicYearId : null,
      academic_term_id: academicTermId.length ? academicTermId : null,
      class_id: classId,
      subject_id: subjectId,
      assessment_type: assessmentType,
      title: title.length ? title : null,
      max_score: maxScore,
      held_on: heldOn.length ? heldOn : null
    });
    if (error) {
      redirect(`/admin/academics/assessments?toast=${encodeURIComponent(error.message)}&toast_type=error`);
    }

    revalidatePath("/admin/academics/assessments");
    redirect(`/admin/academics/assessments?toast=${encodeURIComponent("Assessment created")}&toast_type=success`);
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Academics"
        title="Assessments"
        description="Create assessments and enter scores."
        actions={
          <a href="#new-assessment" className={buttonClasses({ variant: "primary" })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New assessment
          </a>
        }
      />

      <Card>
        <CardHeader title="All assessments" description="Most recent first. Open one to enter scores." />
        {assessmentRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[640px]">
              <thead>
                <tr>
                  <th scope="col">Assessment</th>
                  <th scope="col">Class / subject</th>
                  <th scope="col">Held on</th>
                  <th scope="col" className="text-right">
                    Max
                  </th>
                  <th scope="col">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {assessmentRows.map((a) => {
                  const cls = firstOrNull(a.classes);
                  const subj = firstOrNull(a.subjects);
                  return (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/admin/academics/assessments/${a.id}`} className="font-semibold text-slate-900 hover:text-brand-green">
                          {a.title ?? a.assessment_type}
                        </Link>
                        <div className="mt-1">
                          <Badge tone="slate">{a.assessment_type}</Badge>
                        </div>
                      </td>
                      <td>
                        <div className="font-medium text-slate-900">{cls ? `${cls.level} - ${cls.name}` : "—"}</div>
                        <div className="mt-0.5 text-xs text-slate-500">{subj?.name ?? "—"}</div>
                      </td>
                      <td className="whitespace-nowrap">{a.held_on ?? "—"}</td>
                      <td className="text-right tabular-nums">{a.max_score}</td>
                      <td className="text-right">
                        <Link
                          href={`/admin/academics/assessments/${a.id}`}
                          className={buttonClasses({ variant: "ghost", size: "sm" })}
                          aria-label={`Open ${a.title ?? a.assessment_type}`}
                        >
                          Scores
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="No assessments yet"
            description="Create your first assessment below, then open it to enter scores."
          />
        )}
      </Card>

      <form action={createAssessment} id="new-assessment" className="scroll-mt-24">
        <FormSection
          title="New assessment"
          description="Set up a test, assignment or exam for a class and subject."
          footer={
            <SubmitButton variant="primary" pendingText="Creating…">
              Create assessment
            </SubmitButton>
          }
        >
          {!hasAnyClass ? (
            <Alert tone="warning" className="mb-4">
              No classes are assigned to your account yet. Ask an admin to assign you to at least one class.
            </Alert>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Class" htmlFor="as-class" required>
              <select id="as-class" className="gf-select" name="class_id" defaultValue="" required disabled={!hasAnyClass}>
                <option value="">Select class</option>
                {classRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Subject" htmlFor="as-subject" required>
              <select id="as-subject" className="gf-select" name="subject_id" defaultValue="" required>
                <option value="">Select subject</option>
                {subjectRows.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic year" htmlFor="as-year" hint="Optional">
              <select id="as-year" className="gf-select" name="academic_year_id" defaultValue="">
                <option value="">—</option>
                {yearRows.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic term" htmlFor="as-term" hint="Optional">
              <select id="as-term" className="gf-select" name="academic_term_id" defaultValue="">
                <option value="">—</option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Type" htmlFor="as-type">
              <select id="as-type" className="gf-select" name="assessment_type" defaultValue={assessmentTypes[0]}>
                {assessmentTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Held on" htmlFor="as-held" hint="Optional">
              <input id="as-held" className="gf-input" name="held_on" type="date" />
            </Field>
            <Field label="Title" htmlFor="as-title" hint="Optional">
              <input id="as-title" className="gf-input" name="title" placeholder="Mid-term test" />
            </Field>
            <Field label="Max score" htmlFor="as-max" required>
              <input id="as-max" className="gf-input" name="max_score" type="number" step="0.01" defaultValue="100" required />
            </Field>
          </div>
        </FormSection>
      </form>
    </div>
  );
}
