import Link from "next/link";
import { CheckCircle2, History } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate } from "@/lib/lagos-dates";
import { LEARN } from "@/lib/learn-guides";
import { CLASS_HISTORY_SOURCES } from "@/lib/class-history";
import { setClassForTermAction } from "./actions";

// Pupils' class, term by term (student_class_terms, docs/migrations/20261118b_pupil_class_history.sql).
// Admins only (route-access + RLS). Lists the pupils whose records put them in two classes in one term, so an admin
// can say which class they were in, and the latest changes to the history with who made them.

type Candidate = {
  class_id: string;
  class_name: string;
  class_level: string | null;
  scores: number;
  welfare: number;
  attendance: number;
  comments: number;
  published: boolean;
  current: boolean;
};

type ConflictRow = {
  id: string;
  student_id: string;
  academic_term_id: string;
  candidates: Candidate[];
  provisional_class_id: string | null;
  found_at: string;
  students: { first_name: string; last_name: string; admission_number: string | null } | Array<{ first_name: string; last_name: string; admission_number: string | null }> | null;
  academic_terms: { name: string; academic_years: { name: string } | Array<{ name: string }> | null } | Array<{ name: string; academic_years: { name: string } | Array<{ name: string }> | null }> | null;
};

type LogRow = {
  id: number;
  student_id: string | null;
  student_name: string | null;
  term_name: string | null;
  from_class_name: string | null;
  to_class_name: string | null;
  source: string;
  note: string | null;
  done_by_name: string | null;
  done_at: string;
};

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

// "12 scores · 30 register days · on the published report card · class now"
function evidence(c: Candidate) {
  const bits: string[] = [];
  if (c.scores) bits.push(plural(c.scores, "score", "scores"));
  if (c.attendance) bits.push(plural(c.attendance, "register day", "register days"));
  if (c.welfare) bits.push(plural(c.welfare, "welfare rating", "welfare ratings"));
  if (c.comments) bits.push("report card comment");
  if (c.published) bits.push("on the published report card");
  if (c.current) bits.push("their class now");
  return bits.join(" · ");
}

export default async function ClassHistoryPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [conflictRes, logRes, { data: classData }] = await Promise.all([
    supabase
      .from("student_class_term_conflicts")
      .select(
        "id, student_id, academic_term_id, candidates, provisional_class_id, found_at, students(first_name, last_name, admission_number), academic_terms(name, academic_years(name))"
      )
      .eq("status", "open")
      .order("found_at", { ascending: true })
      .limit(200),
    supabase
      .from("student_class_term_log")
      .select("id, student_id, student_name, term_name, from_class_name, to_class_name, source, note, done_by_name, done_at")
      .order("done_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(100),
    supabase.from("classes").select("id, level, name, active").order("level").order("name")
  ]);

  const missing = Boolean(conflictRes.error || logRes.error);
  const conflicts = (conflictRes.data ?? []) as unknown as ConflictRow[];
  const log = (logRes.data ?? []) as LogRow[];
  const classes = (classData ?? []) as Array<{ id: string; level: string; name: string; active: boolean }>;
  const className = new Map(classes.map((c) => [c.id, c.name] as const));

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.classHistory}
        back={{ href: "/admin/students", label: "Back to students" }}
        eyebrow="Students"
        title="Class history"
        description="Which class each pupil was in, term by term. Past report cards and result sheets use it, so a pupil moved up still appears on last term's cards."
      />

      {missing ? (
        <Alert tone="warning" title="Not set up yet">
          Run docs/migrations/20261118b_pupil_class_history.sql in Supabase. It also fills in past terms from the scores, registers and
          report cards already saved.
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={conflicts.length ? `Needs checking (${conflicts.length})` : "Needs checking"}
          description="Pupils whose records put them in two classes in the same term. Choose the class they were really in; the other records are not changed."
        />
        {conflicts.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={missing ? "Nothing to show yet" : "Nothing to check"}
            description={missing ? undefined : "Every pupil has one class for each term."}
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {conflicts.map((c) => {
              const s = firstOrNull(c.students);
              const t = firstOrNull(c.academic_terms);
              const year = t ? firstOrNull(t.academic_years) : null;
              const name = s ? `${s.first_name} ${s.last_name}` : "Pupil";
              const termLabel = [t?.name, year?.name].filter(Boolean).join(", ") || "Term";
              const candidates = Array.isArray(c.candidates) ? c.candidates : [];
              const candidateIds = new Set(candidates.map((k) => k.class_id));
              const others = classes.filter((k) => !candidateIds.has(k.id) && k.active);
              return (
                <li key={c.id} className="px-5 py-4 sm:px-6">
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div>
                        <Link href={`/admin/students/${c.student_id}`} className="font-semibold text-slate-900 hover:underline">
                          {name}
                        </Link>
                        {s?.admission_number ? <span className="ml-2 font-mono text-xs text-slate-500">{s.admission_number}</span> : null}
                        <div className="text-sm text-slate-600">{termLabel}</div>
                      </div>
                      <ul className="space-y-1 text-sm">
                        {candidates.map((k) => (
                          <li key={k.class_id}>
                            <span className="font-medium text-slate-900">{k.class_name}</span>
                            <span className="text-slate-500"> — {evidence(k) || "no records"}</span>
                          </li>
                        ))}
                      </ul>
                      {c.provisional_class_id ? (
                        <p className="text-xs text-slate-500">
                          For now this term counts as {className.get(c.provisional_class_id) ?? "their class now"}.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">Until you choose, this pupil is left off both classes&apos; report cards for this term.</p>
                      )}
                    </div>
                    <form action={setClassForTermAction} className="flex w-full flex-col gap-2 sm:flex-row sm:items-end md:w-auto">
                      <input type="hidden" name="student_id" value={c.student_id} />
                      <input type="hidden" name="term_id" value={c.academic_term_id} />
                      <div className="min-w-0 sm:w-56">
                        <label htmlFor={`class-${c.id}`} className="gf-label">
                          Class in {t?.name ?? "this term"}
                        </label>
                        <select
                          id={`class-${c.id}`}
                          name="class_id"
                          className="gf-select"
                          required
                          defaultValue={c.provisional_class_id ?? ""}
                          aria-label={`Class ${name} was in, ${termLabel}`}
                        >
                          <option value="" disabled>
                            Choose…
                          </option>
                          <optgroup label="From the records">
                            {candidates.map((k) => (
                              <option key={k.class_id} value={k.class_id}>
                                {k.class_name}
                              </option>
                            ))}
                          </optgroup>
                          {others.length ? (
                            <optgroup label="Other classes">
                              {others.map((k) => (
                                <option key={k.id} value={k.id}>
                                  {k.name}
                                </option>
                              ))}
                            </optgroup>
                          ) : null}
                        </select>
                      </div>
                      <div className="min-w-0 sm:w-48">
                        <label htmlFor={`note-${c.id}`} className="gf-label">
                          Note (optional)
                        </label>
                        <input id={`note-${c.id}`} name="note" className="gf-input" placeholder="e.g. moved after half term" />
                      </div>
                      <SubmitButton size="sm" pendingText="Saving…">
                        Save
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Recent changes" description="The latest 100 changes to pupils' classes by term, with who made them." />
        {log.length === 0 ? (
          <EmptyState icon={History} title="No changes yet" description="Class changes, new terms and corrections are listed here." />
        ) : (
          <CardBody className="p-0">
            <div className="gf-table-wrap">
              <table className="gf-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Pupil</th>
                    <th>Term</th>
                    <th>Change</th>
                    <th>How</th>
                    <th>By</th>
                  </tr>
                </thead>
                <tbody>
                  {log.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap">{formatLagosDate(l.done_at)}</td>
                      <td>
                        {l.student_id ? (
                          <Link className="gf-link" href={`/admin/students/${l.student_id}`}>
                            {l.student_name ?? "Pupil"}
                          </Link>
                        ) : (
                          l.student_name ?? "Pupil"
                        )}
                      </td>
                      <td>{l.term_name ?? "—"}</td>
                      <td>
                        {l.from_class_name && l.from_class_name === l.to_class_name ? (
                          <span>Kept in {l.to_class_name}</span>
                        ) : (
                          <span>
                            {l.from_class_name ?? "No class"} → {l.to_class_name ?? "No class"}
                          </span>
                        )}
                        {l.note ? <div className="mt-0.5 text-xs text-slate-500">{l.note}</div> : null}
                      </td>
                      <td>
                        <Badge tone={l.source === "admin" ? "blue" : "slate"}>{CLASS_HISTORY_SOURCES[l.source] ?? l.source}</Badge>
                      </td>
                      <td>{l.done_by_name ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        )}
      </Card>
    </div>
  );
}
