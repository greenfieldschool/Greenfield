import type { ReactNode } from "react";
import { Crest, schoolName } from "@/components/ui/logo";
import { school } from "@/lib/school";
import { ordinal, type ClassReport, type StudentReport } from "@/lib/term-report";
import { gradeRemark } from "@/lib/results";
import { cn } from "@/lib/cn";

// The printable termly report card: student details, the term result (final score, grade, position and the sum
// behind it) up front, then every subject with its CA / exam breakdown, welfare criteria, comments and the keys.
// Used by the admin report cards page, the printed batch and the parent portal, so all three always match.

const fmt = (v: number | null | undefined, digits = 1) =>
  v === null || v === undefined ? "—" : String(Math.round(v * 10 ** digits) / 10 ** digits);

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function age(dob: string | null) {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) years -= 1;
  return years >= 0 ? years : null;
}

function Part({ label, value, note }: { label: string; value: string; note: string | null }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-base font-bold tabular-nums leading-tight text-slate-900">{value}</div>
      {note ? <div className="text-[10.5px] text-slate-500">{note}</div> : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="truncate text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

export default function ReportCard({
  report,
  student,
  showPositions = true,
  className
}: {
  report: ClassReport;
  student: StudentReport;
  showPositions?: boolean;
  className?: string;
}) {
  const s = student.student;
  const fullName = [s.last_name, s.first_name, s.middle_name].filter(Boolean).join(" ");
  const classSize = report.students.length > 1 ? report.students.length : null;
  const studentAge = age(s.date_of_birth);
  const groupsUsed = (["ca", "exam", "other"] as const).filter((g) => report.subjects.some((sub) => sub.columns.some((c) => c.group === g)));
  const groupHeading = { ca: "CA", exam: "Exam", other: "Other" } as const;
  const gradeNote = (grade: string | null) => (grade ? [grade, gradeRemark(grade, report.grades)].filter(Boolean).join(" · ") : null);
  const termRemark = gradeRemark(student.termGrade, report.grades);
  const notReady = [
    student.academicAverage === null ? "no subject scores yet" : null,
    student.welfare.percent === null ? "welfare not scored yet" : null
  ].filter(Boolean);
  const awards = report.welfareAwards;

  return (
    <article className={cn("gf-report-card mx-auto max-w-[210mm] rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-card sm:p-8", className)}>
      {/* School header */}
      <header className="flex items-center gap-4 border-b-2 border-brand-green-800 pb-4">
        <Crest className="h-24 w-[86px] shrink-0" section={report.cls?.level} title={`${schoolName(report.cls?.level)} crest`} />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold tracking-tight text-brand-green-900">{schoolName(report.cls?.level)}</div>
          <div className="text-xs text-slate-600">{school.address}</div>
          <div className="text-xs text-slate-600">
            {school.phone} · {school.email}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-gold-700">Termly report</div>
          <div className="text-sm font-semibold">{report.term.name}</div>
          <div className="text-xs text-slate-600">{report.year?.name ?? ""}</div>
        </div>
      </header>

      {/* Student details */}
      <section className="mt-4 flex gap-4">
        {s.photo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.photo_url} alt="" className="h-24 w-20 shrink-0 rounded-lg border border-slate-200 object-cover" />
        ) : null}
        <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
          <div className="col-span-2">
            <Info label="Name" value={fullName} />
          </div>
          <Info label="Admission no." value={s.admission_number ?? "—"} />
          <Info label="Class" value={`${report.cls.name}`} />
          <Info label="Sex" value={s.sex ? s.sex.charAt(0).toUpperCase() + s.sex.slice(1) : "—"} />
          <Info label="Age" value={studentAge !== null ? `${studentAge} years` : "—"} />
          <Info
            label="Attendance"
            value={report.daysOpened ? `${student.attendance.present + student.attendance.late} of ${report.daysOpened} days` : "—"}
          />
          <Info label="Next term begins" value={formatDate(report.nextTermStartsOn)} />
        </div>
      </section>

      {/* Term result: the outcome first, with the sum that makes it. */}
      <section
        className="mt-4 flex flex-col gap-3 rounded-xl border border-brand-green-200 bg-brand-green-50 p-3 sm:flex-row sm:items-center print:flex-row print:items-center"
        aria-label="Term result"
      >
        {student.termTotal === null ? (
          <div className="min-w-0 flex-1">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Final score</div>
            <div className="text-lg font-bold text-slate-700">Not ready yet</div>
            <div className="text-xs text-slate-600">The final score needs both halves: {notReady.join(" and ")}.</div>
          </div>
        ) : (
          <>
            <div className="flex shrink-0 items-center gap-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-green-800">Final score</div>
                <div className="text-[2rem] font-bold leading-none tabular-nums text-brand-green-900">
                  {fmt(student.termTotal, 2)}
                  <span className="ml-0.5 text-sm font-semibold text-slate-500">/100</span>
                </div>
              </div>
              {student.termGrade ? (
                <div className="min-w-[3.5rem] rounded-lg bg-brand-green-800 px-2.5 py-1.5 text-center text-white">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-brand-green-100">Grade</div>
                  <div className="text-2xl font-bold leading-none">{student.termGrade}</div>
                  {termRemark ? <div className="mt-0.5 whitespace-nowrap text-[10px] font-medium">{termRemark}</div> : null}
                </div>
              ) : null}
              {showPositions && student.position ? (
                <div className="rounded-lg border border-brand-green-200 bg-white px-2.5 py-1.5 text-center">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Position</div>
                  <div className="text-xl font-bold leading-none tabular-nums text-slate-900">{ordinal(student.position)}</div>
                  {classSize ? <div className="mt-0.5 text-[10px] text-slate-500">of {classSize}</div> : null}
                </div>
              ) : null}
            </div>
            <div className="min-w-0 flex-1 sm:border-l sm:border-brand-green-200 sm:pl-3 print:border-l print:border-brand-green-200 print:pl-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">How it is worked out</div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-600">
                <span aria-hidden="true">(</span>
                <Part label="Academic average" value={fmt(student.academicAverage, 2)} note={gradeNote(student.academicGrade)} />
                <span aria-label="plus">+</span>
                <Part
                  label="Welfare"
                  value={fmt(student.welfare.percent, 2)}
                  note={student.welfareBadge ? `${student.welfareBadge} award` : null}
                />
                <span className="whitespace-nowrap">
                  <span aria-hidden="true">)</span> ÷ 2 = <span className="font-bold tabular-nums text-brand-green-900">{fmt(student.termTotal, 2)}</span>
                </span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* Academic */}
      <section className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-brand-green-800">Academic performance</h3>
        {/* Phones: one row per subject, so nothing scrolls sideways. The full table is for wider screens and print. */}
        <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 sm:hidden print:hidden">
          {report.subjects.map((sub, i) => {
            const r = student.subjects[i];
            const breakdown = sub.columns
              .map((c, j) => `${c.label} ${r.scores[j] === null ? "–" : fmt(r.scores[j])}/${fmt(c.max)}`)
              .join(" · ");
            return (
              <li key={sub.id} className="px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{sub.name}</div>
                    {sub.columns.length ? <div className="mt-0.5 text-xs leading-snug text-slate-500">{breakdown}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-lg font-bold tabular-nums text-slate-900">
                      {fmt(r.percent)}
                      <span className="text-xs font-medium text-slate-400">/100</span>
                    </span>
                    <span className="inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg bg-brand-green-50 px-1.5 text-sm font-bold text-brand-green-900">
                      {r.grade ?? "—"}
                    </span>
                  </div>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  Class average {fmt(sub.classAverage)} · Highest {fmt(sub.highest)}
                  {showPositions && r.position ? ` · ${ordinal(r.position)} in class` : ""}
                </div>
              </li>
            );
          })}
          {!report.subjects.length ? <li className="px-3 py-3 text-center text-sm text-slate-500">No subjects recorded for this term.</li> : null}
        </ul>
        <div className="mt-2 hidden overflow-x-auto sm:block print:block">
          <table className="w-full min-w-[560px] border-collapse text-[13px]">
            <thead>
              <tr className="bg-brand-green-50 text-left text-[11px] font-semibold uppercase tracking-wide text-brand-green-900">
                <th className="border border-slate-200 px-2 py-1.5">Subject</th>
                {groupsUsed.map((g) => (
                  <th key={g} className="border border-slate-200 px-2 py-1.5 text-center">
                    {groupHeading[g]}
                  </th>
                ))}
                <th className="border border-slate-200 px-2 py-1.5 text-center">Total /100</th>
                <th className="border border-slate-200 px-2 py-1.5 text-center">Grade</th>
                <th className="border border-slate-200 px-2 py-1.5 text-center">Class avg.</th>
                <th className="border border-slate-200 px-2 py-1.5 text-center">Highest</th>
                {showPositions ? <th className="border border-slate-200 px-2 py-1.5 text-center">Pos.</th> : null}
              </tr>
            </thead>
            <tbody>
              {report.subjects.map((sub, i) => {
                const r = student.subjects[i];
                const groupScore = (g: "ca" | "exam" | "other") => {
                  const idx = sub.columns.map((c, j) => (c.group === g ? j : -1)).filter((j) => j >= 0);
                  if (!idx.length) return null;
                  const max = idx.reduce((a, j) => a + sub.columns[j].max, 0);
                  const got = idx.map((j) => r.scores[j]);
                  return got.every((v) => v === null) ? `–/${fmt(max)}` : `${fmt(got.reduce<number>((a, v) => a + (v ?? 0), 0))}/${fmt(max)}`;
                };
                const breakdown = sub.columns
                  .map((c, j) => `${c.label} ${r.scores[j] === null ? "–" : fmt(r.scores[j])}/${fmt(c.max)}`)
                  .join(" · ");
                return (
                  <tr key={sub.id} className="align-top">
                    <td className="border border-slate-200 px-2 py-1.5">
                      <div className="font-semibold">{sub.name}</div>
                      {sub.columns.length ? <div className="text-[10.5px] leading-snug text-slate-500">{breakdown}</div> : null}
                    </td>
                    {groupsUsed.map((g) => (
                      <td key={g} className="border border-slate-200 px-2 py-1.5 text-center tabular-nums">
                        {groupScore(g) ?? ""}
                      </td>
                    ))}
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-bold tabular-nums">{fmt(r.percent)}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center font-semibold">{r.grade ?? "—"}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center tabular-nums text-slate-600">{fmt(sub.classAverage)}</td>
                    <td className="border border-slate-200 px-2 py-1.5 text-center tabular-nums text-slate-600">{fmt(sub.highest)}</td>
                    {showPositions ? (
                      <td className="border border-slate-200 px-2 py-1.5 text-center tabular-nums text-slate-600">
                        {r.position ? ordinal(r.position) : "—"}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {!report.subjects.length ? (
                <tr>
                  <td colSpan={6} className="border border-slate-200 px-2 py-3 text-center text-slate-500">
                    No subjects recorded for this term.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Welfare */}
      <section className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-brand-green-800">Welfare &amp; character</h3>
        {student.welfare.items.length ? (
          <div className="mt-2 grid border-l border-t border-slate-200 text-[12.5px] sm:grid-cols-2 print:grid-cols-2">
            {student.welfare.items.map((item) => (
              <div key={item.criterion.id} className="flex items-baseline gap-2 border-b border-r border-slate-200 px-2 py-1">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{item.criterion.name}</span>
                  <span className="ml-1.5 text-[11px] text-slate-500">
                    {item.criterion.source === "rating" ? item.detail : `${item.detail}${item.points === null ? " (not counted)" : ""}`}
                  </span>
                </div>
                <div className="shrink-0 tabular-nums font-semibold">
                  {item.points === null ? "—" : fmt(item.points)}
                  <span className="font-normal text-slate-500">/{fmt(Number(item.criterion.max_points))}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No welfare criteria set for this level.</p>
        )}
        {student.welfare.mode === "weekly" && student.welfare.weeksCounted ? (
          <div className="mt-2 flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-[11px] text-slate-600">
            <span className="font-semibold text-slate-700">Weekly scores (out of 100):</span>
            {report.weeks
              .filter((w) => !w.future)
              .map((w) => {
                const wk = student.welfare.weeks.find((x) => x.weekStart === w.start);
                const counted = wk?.counted && wk.percent !== null;
                return (
                  <span
                    key={w.start}
                    className={cn("rounded border px-1 tabular-nums", counted ? "border-slate-200" : "border-dashed border-slate-200 text-slate-400")}
                    title={counted ? undefined : "Not scored, so not counted"}
                  >
                    Wk {w.number}: {counted ? fmt(wk.percent, 0) : "–"}
                  </span>
                );
              })}
            <span>
              → average of {student.welfare.weeksCounted} week{student.welfare.weeksCounted === 1 ? "" : "s"} ={" "}
              <span className="font-semibold text-slate-800">{fmt(student.welfare.percent, 2)}</span>
            </span>
          </div>
        ) : null}
      </section>

      {/* Comments */}
      <section className="mt-4 grid gap-3 sm:grid-cols-2">
        {[
          { label: "Class teacher's comment", value: student.comments.classTeacher },
          { label: "Head teacher's comment", value: student.comments.head }
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{c.label}</div>
            <p className="mt-1 min-h-[2.5rem] text-sm text-slate-800">{c.value?.trim() || "—"}</p>
            <div className="mt-3 flex items-end justify-between gap-4 text-[11px] text-slate-500">
              <span className="flex-1 border-t border-dotted border-slate-400 pt-0.5">Signature</span>
              <span className="w-24 border-t border-dotted border-slate-400 pt-0.5">Date</span>
            </div>
          </div>
        ))}
      </section>

      {/* Keys */}
      <footer className="mt-4 space-y-0.5 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
        <div>
          <span className="font-semibold">Final score</span> = (academic average + welfare) ÷ 2. The academic average is the average of the subject
          totals.{student.welfare.mode === "weekly" ? " Welfare is scored out of 100 every week; the term's welfare is the average of the weeks scored." : ""}
        </div>
        {report.grades.length ? (
          <div>
            <span className="font-semibold">Grading key: </span>
            {report.grades.map((g) => `${g.grade} ${fmt(Number(g.min_score), 2)}–${fmt(Number(g.max_score), 2)}${g.remark ? ` ${g.remark}` : ""}`).join(" · ")}
          </div>
        ) : null}
        {awards ? (
          <div>
            <span className="font-semibold">Welfare awards: </span>
            Gold {fmt(awards.gold, 2)} and above · Silver {fmt(awards.silver, 2)} and above · Bronze {fmt(awards.bronze, 2)} and above
          </div>
        ) : null}
      </footer>
    </article>
  );
}
