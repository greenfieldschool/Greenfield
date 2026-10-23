import { revalidatePath } from "next/cache";
import { MessageSquareText, Save, Wand2 } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacherAccess } from "@/lib/teacher-access";
import { buildClassReport, ordinal, suggestedComment } from "@/lib/term-report";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import ConfirmActionButton from "@/components/confirm-action-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";
import { canManageClassReports, ClassTermPicker, loadReportPicker, reportsBack } from "../_shared";

const PATH = "/admin/academics/reports/comments";

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

type CommentContext = { classId: string; termId: string; yearId: string; params: { class_id: string; term_id: string } };

async function prepare(formData: FormData): Promise<CommentContext & { supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>; isAdmin: boolean }> {
  const classId = String(formData.get("class_id") ?? "").trim();
  const termId = String(formData.get("term_id") ?? "").trim();
  const params = { class_id: classId, term_id: termId };
  const supabase = getSupabaseServerClient();
  if (!supabase || !classId || !termId) reportsBack(PATH, params, "Choose a class and term first", "error");
  const access = await getTeacherAccess(supabase);
  if (!canManageClassReports(access, classId)) reportsBack(PATH, params, "Only the class teacher or an admin can write comments", "error");
  const { data: profile } = access.userId
    ? await supabase.from("profiles").select("role").eq("id", access.userId).maybeSingle()
    : { data: null };
  const role = (profile as { role?: string } | null)?.role;
  const { data: term } = await supabase.from("academic_terms").select("academic_year_id").eq("id", termId).maybeSingle();
  return {
    supabase,
    classId,
    termId,
    yearId: (term as { academic_year_id: string } | null)?.academic_year_id ?? "",
    params,
    isAdmin: role === "admin" || role === "super_admin"
  };
}

function revalidateComments() {
  revalidatePath(PATH);
  revalidatePath("/admin/academics/reports");
  revalidatePath("/portal/academics");
}

// Saves only the comments that changed. Class teacher and head teacher comments are saved separately so one
// never blanks the other.
async function saveComments(formData: FormData) {
  "use server";
  const { supabase, classId, termId, yearId, params, isAdmin } = await prepare(formData);
  const studentIds = String(formData.get("student_ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const base = (studentId: string) => ({
    student_id: studentId,
    academic_term_id: termId,
    academic_year_id: yearId || null,
    class_id: classId,
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString()
  });

  const teacherRows: Array<ReturnType<typeof base> & { class_teacher_comment: string | null }> = [];
  const headRows: Array<ReturnType<typeof base> & { head_comment: string | null }> = [];
  for (const id of studentIds) {
    const ct = String(formData.get(`ct:${id}`) ?? "").trim();
    if (formData.has(`ct:${id}`) && ct !== String(formData.get(`orig_ct:${id}`) ?? "").trim()) {
      teacherRows.push({ ...base(id), class_teacher_comment: ct || null });
    }
    if (isAdmin && formData.has(`head:${id}`)) {
      const head = String(formData.get(`head:${id}`) ?? "").trim();
      if (head !== String(formData.get(`orig_head:${id}`) ?? "").trim()) headRows.push({ ...base(id), head_comment: head || null });
    }
  }

  for (const rows of [teacherRows, headRows]) {
    if (!rows.length) continue;
    const { error } = await supabase.from("report_card_comments").upsert(rows, { onConflict: "student_id,academic_term_id" });
    if (error) reportsBack(PATH, params, error.message, "error");
  }
  revalidateComments();
  const changed = teacherRows.length + headRows.length;
  reportsBack(PATH, params, changed ? `Saved ${changed} comment(s)` : "Nothing had changed");
}

// Writes a starting comment (based on the term total) for every pupil who has no class teacher comment yet.
async function fillSuggestions(formData: FormData) {
  "use server";
  const { supabase, classId, termId, yearId, params } = await prepare(formData);
  const report = await buildClassReport(supabase, classId, termId);
  if (!report) reportsBack(PATH, params, "That class or term could not be found", "error");
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const rows = report.students
    .filter((r) => !r.comments.classTeacher?.trim() && r.termTotal !== null)
    .map((r) => ({
      student_id: r.student.id,
      academic_term_id: termId,
      academic_year_id: yearId || null,
      class_id: classId,
      class_teacher_comment: suggestedComment(r.student.first_name, r.termTotal),
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString()
    }));
  if (!rows.length) reportsBack(PATH, params, "Every pupil with scores already has a comment", "error");
  const { error } = await supabase.from("report_card_comments").upsert(rows, { onConflict: "student_id,academic_term_id" });
  if (error) reportsBack(PATH, params, error.message, "error");
  revalidateComments();
  reportsBack(PATH, params, `Added suggested comments for ${rows.length} pupil(s). Read through and personalise them.`);
}

export default async function ReportCommentsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const access = await getTeacherAccess(supabase);
  const picker = await loadReportPicker(supabase, access);
  const classId = str(sp.class_id);
  const termId = str(sp.term_id) || (classId ? picker.activeTermId : "");
  const allowed = classId ? canManageClassReports(access, classId) : true;
  const { data: profile } = access.userId
    ? await supabase.from("profiles").select("role").eq("id", access.userId).maybeSingle()
    : { data: null };
  const role = (profile as { role?: string } | null)?.role ?? "";
  const isAdmin = role === "admin" || role === "super_admin";

  const report = classId && termId && allowed ? await buildClassReport(supabase, classId, termId) : null;

  const textarea =
    "w-full min-h-[4.5rem] rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15 disabled:bg-slate-50 disabled:text-slate-500";

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Report cards"
        title="Comments"
        description="The class teacher writes a comment for every pupil; the head teacher (admin) adds theirs. Only comments you change are saved."
        back={{ href: `/admin/academics/reports?class_id=${classId}&term_id=${termId}`, label: "Report cards" }}
      />

      <Card>
        <div className="px-5 py-5 sm:px-6">
          <ClassTermPicker action={PATH} classes={picker.classes} terms={picker.terms} classId={classId} termId={termId} />
        </div>
      </Card>

      {!classId || !termId ? (
        <Card>
          <EmptyState icon={MessageSquareText} title="No class open" description="Choose a class and term to write comments." />
        </Card>
      ) : !allowed ? (
        <Alert tone="danger">Only the class teacher of this class or an admin can write its comments.</Alert>
      ) : !report ? (
        <Alert tone="danger">That class or term could not be found.</Alert>
      ) : (
        <form action={saveComments}>
          <input type="hidden" name="class_id" value={classId} />
          <input type="hidden" name="term_id" value={termId} />
          <input type="hidden" name="student_ids" value={report.students.map((r) => r.student.id).join(",")} />
          <Card>
            <CardHeader
              title={`${report.cls.name} · ${report.term.name}`}
              description={`Class teacher comments ${report.completeness.classCommentsDone}/${report.students.length} · head teacher ${report.completeness.headCommentsDone}/${report.students.length}`}
              action={
                <ConfirmActionButton
                  formAction={fillSuggestions}
                  confirmMessage="Write a suggested comment (based on the term total) for every pupil who has no class teacher comment yet? You can edit them afterwards."
                  className={buttonClasses({ variant: "secondary", size: "sm" })}
                >
                  <Wand2 className="h-4 w-4" aria-hidden="true" />
                  Suggest for blanks
                </ConfirmActionButton>
              }
            />
            {report.students.length ? (
              <ul className="divide-y divide-slate-100">
                {report.students.map((r) => {
                  const id = r.student.id;
                  return (
                    <li key={id} className="grid gap-3 px-5 py-4 sm:px-6 lg:grid-cols-[14rem_1fr_1fr]">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {r.student.last_name} {r.student.first_name}
                        </div>
                        <div className="text-xs text-slate-500">
                          Term total {r.termTotal ?? "—"}
                          {r.termGrade ? ` · ${r.termGrade}` : ""}
                          {r.position ? ` · ${ordinal(r.position)}` : ""}
                        </div>
                        <div className="text-xs text-slate-500">
                          Academic {r.academicAverage ?? "—"} · Welfare {r.welfare.percent ?? "—"}
                        </div>
                      </div>
                      <div>
                        <label htmlFor={`ct-${id}`} className="text-xs font-semibold text-slate-600">
                          Class teacher
                        </label>
                        <input type="hidden" name={`orig_ct:${id}`} value={r.comments.classTeacher ?? ""} />
                        <textarea id={`ct-${id}`} name={`ct:${id}`} className={textarea} defaultValue={r.comments.classTeacher ?? ""} maxLength={600} />
                      </div>
                      <div>
                        <label htmlFor={`head-${id}`} className="text-xs font-semibold text-slate-600">
                          Head teacher {isAdmin ? "" : "(admin only)"}
                        </label>
                        <input type="hidden" name={`orig_head:${id}`} value={r.comments.head ?? ""} />
                        <textarea
                          id={`head-${id}`}
                          name={`head:${id}`}
                          className={textarea}
                          defaultValue={r.comments.head ?? ""}
                          maxLength={600}
                          disabled={!isAdmin}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <EmptyState icon={MessageSquareText} title="No pupils in this class" />
            )}
            {report.students.length ? (
              <div className="sticky bottom-0 flex justify-end rounded-b-2xl border-t border-slate-200 bg-white/95 px-5 py-3 backdrop-blur sm:px-6">
                <SubmitButton pendingText="Saving…" className={buttonClasses({ variant: "primary" })}>
                  <span className="inline-flex items-center gap-2">
                    <Save className="h-4 w-4" aria-hidden="true" />
                    Save comments
                  </span>
                </SubmitButton>
              </div>
            ) : null}
          </Card>
        </form>
      )}
    </div>
  );
}
