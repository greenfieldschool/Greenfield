import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import SubmitButton from "@/components/submit-button";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate } from "@/lib/lagos-dates";
import { CLASS_HISTORY_SOURCES } from "@/lib/class-history";
import { setClassForTermAction } from "../class-history/actions";

// The pupil's class, term by term (student_class_terms), on the pupil's page. Admins can correct a term.
// Renders nothing until the database update (20261118b_pupil_class_history.sql) has been run.

type HistoryRow = {
  academic_term_id: string;
  class_name: string;
  source: string;
  note: string | null;
  set_by_name: string | null;
  set_at: string;
  academic_terms:
    | { name: string; starts_on: string | null; academic_years: { name: string } | Array<{ name: string }> | null }
    | Array<{ name: string; starts_on: string | null; academic_years: { name: string } | Array<{ name: string }> | null }>
    | null;
};

export async function ClassHistoryCard({ studentId, isAdmin }: { studentId: string; isAdmin: boolean }) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [historyRes, conflictRes, termsRes, classesRes] = await Promise.all([
    supabase
      .from("student_class_terms")
      .select("academic_term_id, class_name, source, note, set_by_name, set_at, academic_terms(name, starts_on, academic_years(name))")
      .eq("student_id", studentId),
    isAdmin
      ? supabase.from("student_class_term_conflicts").select("academic_term_id").eq("student_id", studentId).eq("status", "open")
      : Promise.resolve({ data: [] as Array<{ academic_term_id: string }>, error: null }),
    isAdmin
      ? supabase.from("academic_terms").select("id, name, starts_on, academic_years(name)").order("starts_on", { ascending: false, nullsFirst: false })
      : Promise.resolve({ data: [], error: null }),
    isAdmin
      ? supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name")
      : Promise.resolve({ data: [], error: null })
  ]);
  if (historyRes.error) return null; // database update not run yet

  const rows = ((historyRes.data ?? []) as unknown as HistoryRow[])
    .map((r) => {
      const t = firstOrNull(r.academic_terms);
      const y = t ? firstOrNull(t.academic_years) : null;
      return { ...r, termLabel: [t?.name, y?.name].filter(Boolean).join(", ") || "Term", startsOn: t?.starts_on ?? "" };
    })
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn));
  const needsChecking = new Set(((conflictRes.data ?? []) as Array<{ academic_term_id: string }>).map((c) => c.academic_term_id));
  const terms = ((termsRes.data ?? []) as unknown as Array<{ id: string; name: string; academic_years: { name: string } | Array<{ name: string }> | null }>).map(
    (t) => ({ id: t.id, label: [t.name, firstOrNull(t.academic_years)?.name].filter(Boolean).join(", ") })
  );
  const classes = (classesRes.data ?? []) as Array<{ id: string; level: string; name: string }>;

  return (
    <Card>
      <CardHeader
        title="Class history"
        description="The class this learner was in each term. Past report cards and result sheets use it."
        action={
          isAdmin ? (
            <Link href="/admin/students/class-history" className="gf-link text-sm">
              All changes
            </Link>
          ) : null
        }
      />
      <CardBody className="space-y-5">
        {rows.length === 0 ? (
          <p className="text-sm text-slate-500">No terms recorded yet. A term is recorded when it is made active, or when the learner joins a class.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {rows.map((r) => (
              <li key={r.academic_term_id} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{r.termLabel}</div>
                  <div className="text-xs text-slate-500">
                    {CLASS_HISTORY_SOURCES[r.source] ?? r.source}
                    {r.set_by_name && r.source !== "records" ? ` · ${r.set_by_name}` : ""} · {formatLagosDate(r.set_at)}
                    {r.note ? ` · ${r.note}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-semibold text-slate-900">{r.class_name}</span>
                  {needsChecking.has(r.academic_term_id) ? <Badge tone="gold">Needs checking</Badge> : null}
                </div>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && terms.length && classes.length ? (
          <form action={setClassForTermAction} className="space-y-3 border-t border-slate-100 pt-4">
            <input type="hidden" name="student_id" value={studentId} />
            <input type="hidden" name="return_to" value="pupil" />
            <div className="text-sm font-semibold text-slate-900">Correct a term</div>
            <p className="text-xs text-slate-500">
              Only changes which class this learner counts in for that term (report cards, result sheets). Their current class, scores and
              registers are not changed. Recorded with your name.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ch-term" className="gf-label">
                  Term
                </label>
                <select id="ch-term" name="term_id" className="gf-select" required defaultValue="">
                  <option value="" disabled>
                    Choose a term
                  </option>
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="ch-class" className="gf-label">
                  Class that term
                </label>
                <select id="ch-class" name="class_id" className="gf-select" required defaultValue="">
                  <option value="" disabled>
                    Choose a class
                  </option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="ch-note" className="gf-label">
                  Note (optional)
                </label>
                <input id="ch-note" name="note" className="gf-input" placeholder="Why, e.g. moved to Basic 2 after half term" />
              </div>
            </div>
            <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
              Save class for that term
            </SubmitButton>
          </form>
        ) : null}
      </CardBody>
    </Card>
  );
}
