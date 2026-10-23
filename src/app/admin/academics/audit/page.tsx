import Link from "next/link";
import { History } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getTeacherAccess } from "@/lib/teacher-access";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonClasses } from "@/components/ui/button";

// Every change to results, recorded by the database itself (see docs/migrations/20261023_result_audit.sql).
// Admins see everything; teachers see the classes and subjects they teach (enforced by RLS).

const PAGE_SIZE = 100;

type LogRow = {
  id: number;
  at: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  class_id: string | null;
  subject_id: string | null;
  academic_term_id: string | null;
  student_id: string | null;
  column_label: string | null;
  old_value: number | null;
  new_value: number | null;
  reason: string | null;
  detail: Record<string, unknown> | null;
};

const actions: Record<string, { label: string; tone: BadgeTone }> = {
  score_added: { label: "Score entered", tone: "green" },
  score_changed: { label: "Score changed", tone: "gold" },
  score_deleted: { label: "Score deleted", tone: "red" },
  column_added: { label: "Column added", tone: "slate" },
  column_changed: { label: "Column changed", tone: "gold" },
  column_removed: { label: "Column removed", tone: "red" },
  rating_added: { label: "Welfare rated", tone: "green" },
  rating_changed: { label: "Welfare rating changed", tone: "gold" },
  rating_deleted: { label: "Welfare rating removed", tone: "red" },
  sheet_submitted: { label: "Submitted as final", tone: "blue" },
  sheet_unlocked: { label: "Unlocked", tone: "violet" },
  published: { label: "Published", tone: "blue" },
  republished: { label: "Published again", tone: "blue" },
  unpublished: { label: "Unpublished", tone: "violet" },
  correction_requested: { label: "Correction requested", tone: "gold" },
  correction_approved: { label: "Correction approved", tone: "green" },
  correction_rejected: { label: "Correction rejected", tone: "red" },
  correction_withdrawn: { label: "Correction withdrawn", tone: "slate" }
};

const groups: Record<string, string[]> = {
  scores: ["score_added", "score_changed", "score_deleted"],
  columns: ["column_added", "column_changed", "column_removed"],
  welfare: ["rating_added", "rating_changed", "rating_deleted"],
  locks: ["sheet_submitted", "sheet_unlocked", "published", "republished", "unpublished"],
  corrections: ["correction_requested", "correction_approved", "correction_rejected", "correction_withdrawn"]
};

function str(v: string | string[] | undefined) {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

const fmt = (v: number | null) => (v === null || v === undefined ? "" : String(Number(v)));

export default async function ResultAuditPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const classId = str(sp.class_id);
  const termId = str(sp.term_id);
  const subjectId = str(sp.subject_id);
  const studentId = str(sp.student_id);
  const group = str(sp.group);
  const page = Math.max(1, Number(str(sp.page)) || 1);
  const access = await getTeacherAccess(supabase);

  let query = supabase
    .from("result_audit_log")
    .select(
      "id, at, actor_name, actor_role, action, class_id, subject_id, academic_term_id, student_id, column_label, old_value, new_value, reason, detail",
      { count: "exact" }
    );
  if (classId) query = query.eq("class_id", classId);
  if (termId) query = query.eq("academic_term_id", termId);
  if (subjectId) query = query.eq("subject_id", subjectId);
  if (studentId) query = query.eq("student_id", studentId);
  if (groups[group]) query = query.in("action", groups[group]);

  const [{ data, count, error }, { data: classes }, { data: terms }, { data: subjects }, { data: years }] = await Promise.all([
    query.order("id", { ascending: false }).range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1),
    supabase.from("classes").select("id, level, name").order("level").order("name"),
    supabase.from("academic_terms").select("id, name, academic_year_id").order("starts_on", { ascending: false }),
    supabase.from("subjects").select("id, name").order("name"),
    supabase.from("academic_years").select("id, name")
  ]);
  const rows = (data ?? []) as LogRow[];

  const studentIds = Array.from(new Set(rows.map((r) => r.student_id).filter((v): v is string => !!v)));
  const { data: studentData } = studentIds.length
    ? await supabase.from("students").select("id, first_name, last_name, admission_number").in("id", studentIds)
    : { data: [] };

  const classById = new Map(((classes ?? []) as Array<{ id: string; level: string; name: string }>).map((c) => [c.id, c] as const));
  const yearName = new Map(((years ?? []) as Array<{ id: string; name: string }>).map((y) => [y.id, y.name] as const));
  const termRows = (terms ?? []) as Array<{ id: string; name: string; academic_year_id: string }>;
  const termById = new Map(termRows.map((t) => [t.id, `${yearName.get(t.academic_year_id) ?? ""} ${t.name}`.trim()] as const));
  const subjectById = new Map(((subjects ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name] as const));
  const studentById = new Map(
    ((studentData ?? []) as Array<{ id: string; first_name: string; last_name: string; admission_number: string | null }>).map(
      (s) => [s.id, s] as const
    )
  );

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageUrl = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ class_id: classId, term_id: termId, subject_id: subjectId, student_id: studentId, group }))
      if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    return `/admin/academics/audit${q.toString() ? `?${q}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Academics"
        title="Results history"
        description={`Every score entered, changed or deleted, every column change, welfare rating, submission, correction request, unlock, publish and unpublish — with who did it and when. The database writes this record itself; nobody can edit or delete it.${
          access.isTeacher ? " You see the classes and subjects you teach." : ""
        }`}
      />

      <Card>
        <CardHeader title="Filter" />
        <CardBody>
          <form className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5" action="/admin/academics/audit">
            {studentId ? <input type="hidden" name="student_id" value={studentId} /> : null}
            <div>
              <label htmlFor="f-class" className="gf-label">
                Class
              </label>
              <select id="f-class" name="class_id" className="gf-select" defaultValue={classId}>
                <option value="">All classes</option>
                {Array.from(classById.values())
                  .filter((c) => !access.isTeacher || access.classes.some((tc) => tc.id === c.id))
                  .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-term" className="gf-label">
                Term
              </label>
              <select id="f-term" name="term_id" className="gf-select" defaultValue={termId}>
                <option value="">All terms</option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {termById.get(t.id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-subject" className="gf-label">
                Subject
              </label>
              <select id="f-subject" name="subject_id" className="gf-select" defaultValue={subjectId}>
                <option value="">All subjects</option>
                {Array.from(subjectById.entries()).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="f-group" className="gf-label">
                Type
              </label>
              <select id="f-group" name="group" className="gf-select" defaultValue={group}>
                <option value="">Everything</option>
                <option value="scores">Scores</option>
                <option value="columns">Columns</option>
                <option value="welfare">Welfare ratings</option>
                <option value="locks">Submit / unlock / publish</option>
                <option value="corrections">Correction requests</option>
              </select>
            </div>
            <div className="flex items-end gap-2">
              <button type="submit" className={buttonClasses({ variant: "primary", className: "w-full" })}>
                Filter
              </button>
              <Link href="/admin/academics/audit" className={buttonClasses({ variant: "ghost" })}>
                Clear
              </Link>
            </div>
          </form>
          {studentId ? (
            <p className="mt-3 text-sm text-slate-600">
              Showing one pupil only.{" "}
              <Link className="gf-link" href={pageUrl(1).replace(/student_id=[^&]*&?/, "")}>
                Show all pupils
              </Link>
            </p>
          ) : null}
        </CardBody>
      </Card>

      {error ? (
        <Alert tone="danger">The audit log is not set up yet. Run docs/migrations/20261023_result_audit.sql in Supabase. ({error.message})</Alert>
      ) : (
        <Card>
          <CardHeader title={`${total} entr${total === 1 ? "y" : "ies"}`} description="Newest first." />
          {rows.length ? (
            <div className="gf-table-wrap">
              <table className="gf-table min-w-[960px]">
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Who</th>
                    <th>What</th>
                    <th>Class · subject · term</th>
                    <th>Pupil</th>
                    <th>Column / criterion</th>
                    <th className="text-right">Change</th>
                    <th>Reason / note</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const a = actions[r.action] ?? { label: r.action, tone: "slate" as BadgeTone };
                    const cls = r.class_id ? classById.get(r.class_id) : null;
                    const st = r.student_id ? studentById.get(r.student_id) : null;
                    const note = [
                      r.reason,
                      typeof r.detail?.remarks === "string" ? r.detail.remarks : null,
                      r.detail?.because === "column removed" ? "Column was removed" : null,
                      r.detail?.via === "merge" ? "Moved when merging duplicates" : null,
                      typeof r.detail?.old_title === "string" ? `Renamed from “${r.detail.old_title}”` : null
                    ].filter(Boolean);
                    const isMax = r.action.startsWith("column_");
                    return (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap text-xs text-slate-600">
                          {new Date(r.at).toLocaleString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: "Africa/Lagos"
                          })}
                        </td>
                        <td>
                          <div className="font-medium text-slate-900">{r.actor_name ?? "Unknown"}</div>
                          {r.actor_role ? <div className="text-xs text-slate-500">{r.actor_role}</div> : null}
                        </td>
                        <td>
                          <Badge tone={a.tone}>{a.label}</Badge>
                        </td>
                        <td className="text-xs text-slate-700">
                          {[cls?.name, r.subject_id ? subjectById.get(r.subject_id) : null, r.academic_term_id ? termById.get(r.academic_term_id) : null]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </td>
                        <td className="text-sm">
                          {st ? (
                            <Link className="hover:underline" href={`/admin/academics/audit?student_id=${st.id}`}>
                              {st.last_name} {st.first_name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="text-sm">{r.column_label ?? "—"}</td>
                        <td className="whitespace-nowrap text-right tabular-nums">
                          {r.old_value === null && r.new_value === null ? (
                            "—"
                          ) : (
                            <>
                              <span className="text-slate-500">{fmt(r.old_value) || "·"}</span>
                              <span className="mx-1 text-slate-400">→</span>
                              <span className="font-semibold text-slate-900">{fmt(r.new_value) || "·"}</span>
                              {isMax ? <div className="text-[11px] text-slate-500">max score</div> : null}
                            </>
                          )}
                        </td>
                        <td className="max-w-[16rem] text-xs text-slate-600">{note.join(" · ") || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState icon={History} title="Nothing recorded yet" description="Changes to results will appear here." />
          )}
          {pages > 1 ? (
            <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm sm:px-6">
              <span className="text-slate-500">
                Page {page} of {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href={pageUrl(page - 1)}>
                    Newer
                  </Link>
                ) : null}
                {page < pages ? (
                  <Link className={buttonClasses({ variant: "secondary", size: "sm" })} href={pageUrl(page + 1)}>
                    Older
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      )}
    </div>
  );
}
