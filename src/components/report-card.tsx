import type { ReactNode } from "react";
import { LogoMark } from "@/components/ui/logo";
import { school } from "@/lib/school";
import { ordinal, type ClassReport, type StudentReport } from "@/lib/term-report";
import { cn } from "@/lib/cn";

// The printable termly report card: student details, every subject with its CA / exam breakdown, welfare
// criteria, the term total (average of academic and welfare), comments and the grading key. Used by the admin
// report cards page, the printed batch and the parent portal, so all three always match.

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

  return (
    <article className={cn("gf-report-card mx-auto max-w-[210mm] rounded-2xl border border-slate-200 bg-white p-6 text-slate-900 shadow-card sm:p-8", className)}>
      {/* School header */}
      <header className="flex items-center gap-4 border-b-2 border-brand-green-800 pb-4">
        <LogoMark className="h-14 w-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xl font-bold tracking-tight text-brand-green-900">Greenfield School</div>
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

      {/* Academic */}
      <section className="mt-5">
        <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-brand-green-800">Academic performance</h3>
        <div className="mt-2 overflow-x-auto">
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
      </section>

      {/* Summary */}
      <section className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          { label: "Academic average", value: student.academicAverage === null ? "—" : `${fmt(student.academicAverage, 2)}%` },
          {
            label: "Welfare",
            value: student.welfare.percent === null ? "—" : `${fmt(student.welfare.percent, 2)}%${student.welfareBadge ? ` · ${student.welfareBadge}` : ""}`
          },
          { label: "Term total", value: student.termTotal === null ? "—" : `${fmt(student.termTotal, 2)}%`, strong: true },
          { label: "Grade", value: student.termGrade ?? "—", strong: true },
          ...(showPositions
            ? [{ label: "Position", value: student.position ? `${ordinal(student.position)}${classSize ? ` of ${classSize}` : ""}` : "—" }]
            : [])
        ].map((box) => (
          <div
            key={box.label}
            className={cn(
              "rounded-xl border px-3 py-2",
              "strong" in box && box.strong ? "border-brand-green-300 bg-brand-green-50" : "border-slate-200 bg-slate-50"
            )}
          >
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{box.label}</div>
            <div className="text-base font-bold tabular-nums text-slate-900">{box.value}</div>
          </div>
        ))}
      </section>
      <p className="mt-1.5 text-[11px] text-slate-500">Term total = average of the academic average and the welfare score.</p>

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

      {/* Grading key */}
      {report.grades.length ? (
        <footer className="mt-4 border-t border-slate-200 pt-2 text-[11px] text-slate-600">
          <span className="font-semibold">Grading key: </span>
          {report.grades.map((g) => `${g.grade} ${fmt(Number(g.min_score), 2)}–${fmt(Number(g.max_score), 2)}`).join(" · ")}
        </footer>
      ) : null}
    </article>
  );
}
