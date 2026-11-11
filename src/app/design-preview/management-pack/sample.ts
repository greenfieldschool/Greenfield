import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMiPack } from "@/lib/mi-pack";
import { MI_PACK_VERSION } from "@/lib/mi-history";
import { addDays, lagosToday, resolvePeriod } from "@/lib/mi-periods";

// Sample database for the dev-only management pack preview: seeded rows plus saved packs for earlier periods, made
// by the real loader, so the preview shows exactly what the live pages would.

type Row = Record<string, unknown>;

// Small seeded random so the preview looks the same on every reload.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

export function sampleTables(today: string): Record<string, Row[]> {
  const r = rng(42);
  const levels = ["creche", "creche", "creche", "primary", "primary", "primary", "primary", "primary", "primary", "secondary", "secondary", "secondary", "secondary", "secondary", "secondary"];
  const names = ["Daycare", "Nursery 1", "Nursery 2", "Year 1", "Year 2", "Year 3", "Year 4", "Year 5", "Year 6", "JSS1", "JSS2", "JSS3", "SS1", "SS2", "SS3"];
  const classes = names.map((name, i) => ({ id: `c${i}`, level: levels[i], name, active: true }));
  const ts = (date: string, h = 10) => `${date}T${String(h - 1).padStart(2, "0")}:00:00.000Z`;
  const start = addDays(today, -75);
  const days: string[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) days.push(d);
  const weekdays = days.filter((d) => ![0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay()));

  const first = ["Ada", "Bola", "Chidi", "Dayo", "Efe", "Funmi", "Gbenga", "Halima", "Ifeoma", "Jide", "Kemi", "Lanre", "Musa", "Nkechi", "Ope", "Peju", "Quadri", "Rita", "Seun", "Tolu"];
  const students: Row[] = [];
  for (let i = 0; i < 380; i++) {
    const c = classes[i % classes.length];
    const status = i < 360 ? "active" : i < 372 ? "withdrawn" : "applied";
    students.push({ id: `s${i}`, first_name: first[i % first.length], last_name: ["Okafor", "Bello", "Adeyemi", "Eze", "Musa"][i % 5], status, level: c.level, class_id: c.id, created_at: ts(i > 350 ? days[Math.floor(r() * days.length)] : "2025-09-01"), updated_at: ts(days[Math.floor(r() * days.length)]) });
  }
  const attendance: Row[] = [];
  let n = 0;
  for (const d of weekdays) {
    for (const s of students.slice(0, 360)) {
      const cls = String(s.class_id);
      if (cls === "c7" && r() < 0.25) continue; // Year 5 sometimes misses its register
      const x = r();
      const weak = cls === "c11" ? 0.08 : 0;
      attendance.push({ id: `a${n++}`, date: d, class_id: cls, recorded_by: `t${cls.slice(1)}`, status: x < 0.05 + weak ? "absent" : x < 0.06 + weak ? "excused" : x < 0.1 + weak ? "late" : "present" });
    }
  }
  const payments: Row[] = [];
  const methods = ["transfer", "transfer", "pos", "cash"];
  for (let i = 0; i < 160; i++) {
    const d = days[Math.floor(r() * days.length)];
    const bank = r() < 0.4;
    payments.push({ id: `p${i}`, direction: "inflow", status: "posted", amount: Math.round(50000 + r() * 400000), method: methods[i % 4], provider: bank ? "bank" : null, received_by: bank ? null : i % 2 ? "x2" : "x3", paid_at: ts(d, 11) });
  }
  const cats = ["Salaries", "Diesel and power", "Repairs", "Teaching materials", "Feeding"];
  const expenses = Array.from({ length: 50 }, (_, i) => ({ id: `e${i}`, amount: Math.round(20000 + r() * 600000), spent_at: ts(days[Math.floor(r() * days.length)]), created_by: "x2", expense_categories: { name: cats[i % cats.length] } }));
  const invoices = Array.from({ length: 140 }, (_, i) => ({
    invoice_id: `i${i}`,
    status: "draft",
    invoice_total: 350000 + Math.round(r() * 300000),
    issue_date: days[Math.floor(r() * days.length)],
    balance: i % 3 === 0 ? Math.round(r() * 300000) : 0,
    due_date: addDays(days[Math.floor(r() * days.length)], 20),
    bill_to_guardian_id: `g${i % 90}`
  }));
  const spread = (prefix: string, count: number, col: string, extra: (i: number) => Row = () => ({})) =>
    Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i}`, [col]: ts(days[Math.floor(r() * days.length)]), ...extra(i) }));

  // 20 teachers: t0–t14 class teachers, t15–t17 subject teachers, t18–t19 not assigned yet. t16 records nothing.
  const teacherFirst = ["Ada", "Bola", "Chidi", "Dayo", "Efe", "Funmi", "Gbenga", "Halima", "Ifeoma", "Jide", "Kemi", "Lanre", "Musa", "Nkechi", "Ope", "Peju", "Quadri", "Rita", "Seun", "Tolu"];
  const profiles: Row[] = [
    ...teacherFirst.map((f, i) => ({ id: `t${i}`, role: "teacher", full_name: `${f} ${["Okafor", "Bello", "Adeyemi", "Eze"][i % 4]}`, created_at: i >= 18 ? ts(days[days.length - 9]) : "2025-08-20T09:00:00.000Z" })),
    { id: "x1", role: "super_admin", full_name: "Mrs Adebayo", created_at: "2025-06-01T09:00:00.000Z" },
    { id: "x2", role: "admin", full_name: "Mr Okon", created_at: "2025-06-01T09:00:00.000Z" },
    { id: "x3", role: "front_desk", full_name: "Grace Udo", created_at: "2025-06-01T09:00:00.000Z" },
    { id: "x4", role: "front_desk", full_name: "Sola Ade", created_at: "2025-06-01T09:00:00.000Z" },
    { id: "x5", role: "nurse", full_name: "Nurse Ibe", created_at: "2025-06-01T09:00:00.000Z" }
  ];
  const workers = Array.from({ length: 18 }, (_, i) => `t${i}`).filter((t) => t !== "t16");
  const by = () => workers[Math.floor(r() * workers.length)];

  // Major subjects: English and Mathematics everywhere except Daycare (none chosen yet). Most weeks every video is
  // posted; Year 4 (c6) often forgets Mathematics, and this week only some are in so far.
  const subjects = [
    { id: "sub-en", name: "English" },
    { id: "sub-ma", name: "Mathematics" }
  ];
  const classSubjects = classes.slice(1).flatMap((c) => subjects.map((sj) => ({ class_id: c.id, subject_id: sj.id, is_major: true, subjects: { id: sj.id, name: sj.name } })));
  const mondaysList = days.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1);
  const starVideos: Row[] = [];
  for (const wk of mondaysList) {
    const thisWeek = wk === mondaysList[mondaysList.length - 1];
    classes.slice(1).forEach((c, ci) => {
      for (const sj of subjects) {
        const miss = (c.id === "c6" && sj.id === "sub-ma" && r() < 0.7) || r() < (thisWeek ? 0.45 : 0.06);
        if (miss) continue;
        const pupil = students.find((st, k) => st.class_id === c.id && k % 7 === (ci + wk.length) % 7) ?? students.find((st) => st.class_id === c.id);
        starVideos.push({
          id: `sv-${wk}-${c.id}-${sj.id}`,
          class_id: c.id,
          subject_id: sj.id,
          week_start: wk,
          student_id: pupil?.id,
          video_url: r() < 0.6 ? "https://drive.google.com/file/d/sample/view" : "https://youtu.be/sample",
          author_name: `${teacherFirst[ci + 1]} ${["Okafor", "Bello", "Adeyemi", "Eze"][(ci + 1) % 4]}`,
          created_by: `t${ci + 1}`,
          created_at: ts(addDays(wk, Math.floor(r() * 6)), 15)
        });
      }
    });
  }

  // Heads (x1 super admin, x2 admin) at work: who-did-it columns on the records they create.
  const head = () => (r() < 0.5 ? "x1" : "x2");
  const when = () => ts(days[Math.floor(r() * days.length)]);
  const headWork = {
    result_publications: Array.from({ length: 4 }, (_, i) => ({ id: `rp${i}`, published_by: "x1", published_at: when() })),
    result_correction_requests_extra: Array.from({ length: 14 }, (_, i) => {
      const asked = days[Math.floor(r() * (days.length - 3))];
      return { id: `rcd${i}`, status: "approved", decided_by: head(), requested_at: ts(asked, 9), decided_at: ts(addDays(asked, Math.floor(r() * 4)), 16) };
    }),
    result_audit_log: Array.from({ length: 6 }, (_, i) => ({ id: i, action: "sheet_unlocked", actor_id: "x2", at: when() })),
    report_card_comments: Array.from({ length: 40 }, (_, i) => ({ id: `rc${i}`, head_comment: "Well done.", updated_by: "x1", updated_at: when() })),
    chat_reports: Array.from({ length: 3 }, (_, i) => ({ id: `cr${i}`, resolved_by: "x2", resolved_at: when() })),
    finance_invoices: Array.from({ length: 30 }, (_, i) => ({ id: `fi${i}`, created_by: "x2", created_at: when() })),
    teacher_class_assignments_recent: [{ teacher_id: "t18", class_id: "c3", assigned_by: "x2", created_at: ts(days[days.length - 3]), active: false }]
  };

  return {
    profiles,
    result_publications: headWork.result_publications,
    result_audit_log: headWork.result_audit_log,
    report_card_comments: headWork.report_card_comments,
    chat_reports: headWork.chat_reports,
    finance_invoices: headWork.finance_invoices,
    subjects,
    class_subjects: classSubjects,
    star_videos: starVideos,
    teacher_class_assignments: [...classes.map((c, i) => ({ teacher_id: `t${i}`, class_id: c.id, active: true, created_at: "2025-08-20T09:00:00.000Z" })), ...headWork.teacher_class_assignments_recent],
    teacher_subject_assignments: ["t15", "t16", "t17"].map((t) => ({ teacher_id: t, active: true })),
    classes,
    students,
    student_attendance: attendance,
    finance_payment_transactions: payments,
    finance_expenses: expenses,
    finance_invoice_balances: invoices,
    admissions_applications: spread("ap", 60, "created_at", (i) => ({ section: levels[i % levels.length], status: i % 7 === 0 ? "submitted" : i % 5 === 0 ? "enrolled" : "lead", updated_at: ts(days[Math.floor(r() * days.length)]) })),
    inquiries: spread("q", 25, "created_at"),
    welfare_incidents: spread("wi", 40, "occurred_at", (i) => ({ severity: (i % 5) + 1, resolved: i % 6 !== 0, reported_by: i % 3 ? "x3" : head() })),
    welfare_discipline_records: spread("wd", 30, "occurred_at", (i) => ({ severity: (i % 3) + 1, reported_by: i % 2 ? `t${i % 15}` : head() })),
    student_uniform_checks: weekdays.slice(-30).flatMap((d, k) => Array.from({ length: 40 }, (_, i) => ({ id: `u${k}-${i}`, date: d, ok: r() > 0.08 }))),
    assignments: spread("as", 110, "created_at", () => ({ created_by: by() })),
    assignment_submissions: spread("sub", 1600, "submitted_at", () => ({ marked_at: r() < 0.7 ? ts(days[Math.floor(r() * days.length)]) : null, marked_by: by() })),
    lesson_notes: spread("ln", 150, "published_at", () => ({ status: "published", created_by: by() })),
    online_classes: spread("oc", 40, "starts_at", (i) => ({ status: i % 9 === 0 ? "cancelled" : "scheduled", created_by: by() })),
    online_class_attendance: spread("oa", 500, "joined_at"),
    exam_attempts: spread("ex", 300, "submitted_at", (i) => ({ percent: Math.round(45 + r() * 50), ...(i % 40 === 0 ? { unlocked_by: "x2", unlocked_at: when() } : {}) })),
    result_correction_requests: [...spread("rc", 9, "requested_at", (i) => ({ status: i % 3 === 0 ? "pending" : "approved" })), ...headWork.result_correction_requests_extra],
    announcements: spread("an", 10, "created_at", () => ({ created_by: "x1" })),
    career_applications: spread("ca", 6, "created_at"),
    chat_messages: spread("cm", 900, "created_at", (i) => ({ removed_at: null, sender_id: i % 12 === 0 ? head() : `t${i % 15}` })),
    email_outbox: spread("em", 1400, "sent_at", () => ({ status: "sent" }))
  };
}

/** Just enough of the Supabase query builder for loadMiPack: filters, head counts and .range(). */
export function fakeClient(tables: Record<string, Row[]>): SupabaseClient {
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let head = false;
    const cmp = (v: unknown) => String(v ?? "");
    const run = (a = 0, b = Infinity) => {
      const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      return head ? { data: null, count: rows.length, error: null } : { data: rows.slice(a, b + 1), count: rows.length, error: null };
    };
    const q = {
      select: (_c?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), q),
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), q),
      in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), q),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), q),
      not: (c: string, _op: string, v: unknown) => (filters.push((r) => (r[c] ?? null) !== v), q),
      gt: (c: string, v: number) => (filters.push((r) => Number(r[c]) > v), q),
      gte: (c: string, v: string) => (filters.push((r) => r[c] != null && cmp(r[c]) >= v), q),
      lte: (c: string, v: string) => (filters.push((r) => r[c] != null && cmp(r[c]) <= v), q),
      lt: (c: string, v: string) => (filters.push((r) => r[c] != null && cmp(r[c]) < v), q),
      order: () => q,
      limit: () => q,
      maybeSingle: () => Promise.resolve(run()).then((r) => ({ data: r.data?.[0] ?? null, error: null })),
      range: (a: number, b: number) => Promise.resolve(run(a, b)),
      then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(run()).then(res, rej)
    };
    return q;
  };
  return { from } as unknown as SupabaseClient;
}


let cached: { day: string; db: SupabaseClient } | null = null;

/** The sample database, with the last 8 weeks and 3 months already saved by the nightly job (one week missing). */
export async function previewDb(): Promise<SupabaseClient> {
  const today = lagosToday();
  if (cached?.day === today) return cached.db;
  const tables = sampleTables(today);
  const db = fakeClient(tables);
  const saved: Array<Record<string, unknown>> = [];
  for (const view of ["week", "month"] as const) {
    let key = resolvePeriod(view, undefined, today).prevKey;
    for (let i = 0; i < (view === "week" ? 8 : 3); i++) {
      const p = resolvePeriod(view, key, today);
      const pack = await loadMiPack(db, db, p);
      saved.push({
        view,
        period_key: p.key,
        period_start: p.start,
        period_end: p.fullEnd,
        data: { ...pack, version: MI_PACK_VERSION },
        source: "automatic",
        saved_by_name: "Saved automatically",
        saved_at: `${addDays(p.fullEnd, 1)}T23:30:00.000Z`
      });
      key = p.prevKey;
    }
  }
  // Leave one finished week unsaved, to show the "Save to history" state.
  tables.mi_pack_snapshots = saved.filter((r) => !(r.view === "week" && r === saved[3]));
  cached = { day: today, db };
  return db;
}
