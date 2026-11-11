// Management information pack: the figures leadership reads each week or month, each compared with the period
// before. Loading is here; the screen is src/app/admin/management-pack/mi-pack-view.tsx (also used by the preview).
//
// Every read is admin-only on the page (it checks the role first). Most tables are readable by admins through RLS;
// messages and the email queue are not, so their totals are counted with the service key (counts only, no content).
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllRows } from "@/lib/fetch-all";
import { formatLagosDate, toLagosDateInput } from "@/lib/lagos-dates";
import { addDays, lagosToday, weekdaysBetween, type MiPeriod, type MiRange } from "@/lib/mi-periods";
import { videoHost } from "@/lib/star-videos";

export type MiFormat = "count" | "money" | "percent";

/** One figure with its comparison. `better` says which way is good news (it colours the change). */
export type MiMetric = {
  /** Stable name for figures the history page lines up across saved packs. */
  id?: string;
  label: string;
  current: number | null;
  previous: number | null;
  format: MiFormat;
  better: "up" | "down" | "none";
  hint?: string;
};

/** A figure that is "as of today" and has no comparison (pupils on roll, fees still owed). */
export type MiSnapshot = { id?: string; label: string; value: number | null; format: MiFormat; hint?: string };

export type MiCell = string | { text: string; href: string };

export type MiTable = {
  title: string;
  columns: string[];
  /** Cells are already formatted text; a cell with `href` is a link (opens in a new tab when it leaves the site). */
  rows: MiCell[][];
  empty: string;
  /** Takes the full width of the card (many columns). */
  wide?: boolean;
};

export type MiSection = {
  key: string;
  title: string;
  description: string;
  metrics: MiMetric[];
  snapshots?: MiSnapshot[];
  tables?: MiTable[];
  /** Shown instead of the figures when the section could not be read. */
  unavailable?: string;
  link?: { href: string; label: string };
};

export type MiNote = { tone: "danger" | "warning" | "info" | "success"; text: string };

export type MiPack = {
  period: MiPeriod;
  generatedAt: string;
  headline: MiMetric[];
  notes: MiNote[];
  sections: MiSection[];
};

const ON_ROLL = ["active", "enrolled"];
const STAFF_ROLES = ["super_admin", "admin", "teacher", "front_desk", "nurse"];
const ROLE_NAMES: Record<string, string> = {
  super_admin: "Super admins (full access)",
  admin: "Admins",
  teacher: "Teachers",
  front_desk: "Front desk",
  nurse: "Nurse"
};
const LEFT = ["withdrawn", "transferred", "graduated"];
const SECTION_NAMES: Record<string, string> = { creche: "Creche", primary: "Primary", secondary: "Secondary" };

type Bucket = "cur" | "prev" | null;

function bucketOf(p: MiPeriod, value: string | null | undefined): Bucket {
  if (!value) return null;
  const d = value.length === 10 ? value : toLagosDateInput(value);
  if (!d) return null;
  if (d >= p.start && d <= p.end) return "cur";
  if (d >= p.previous.start && d <= p.previous.end) return "prev";
  return null;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

export function formatMi(value: number | null, format: MiFormat): string {
  if (value === null || Number.isNaN(value)) return "—";
  if (format === "money") return `₦${Math.round(value).toLocaleString("en-NG")}`;
  if (format === "percent") return `${value.toFixed(1)}%`;
  return Math.round(value).toLocaleString("en-NG");
}

function className(c: { level: string; name: string } | undefined) {
  return c ? c.name : "No class";
}

type CountResult = { count: number | null; error: unknown };

/** Rows with `column` inside the current and the previous period (two head-only counts). */
async function countPair(
  build: (r: MiRange) => PromiseLike<CountResult>,
  p: MiPeriod
): Promise<{ cur: number | null; prev: number | null }> {
  const [a, b] = await Promise.all([build(p), build(p.previous)]);
  return { cur: a.error ? null : (a.count ?? 0), prev: b.error ? null : (b.count ?? 0) };
}

export async function loadMiPack(
  supabase: SupabaseClient,
  service: SupabaseClient | null,
  period: MiPeriod
): Promise<MiPack> {
  const p = period;
  const from = p.previous.start;
  const fromIso = p.previous.startIso;
  const toIso = p.endIsoExclusive;
  const today = lagosToday();

  // Supabase types aren't generated in this repo; rows are read as loose records.
  type Row = Record<string, unknown>;
  const all = (build: () => { range: (a: number, b: number) => PromiseLike<{ data: Row[] | null; error: unknown }> }, max = 100000) =>
    fetchAllRows<Row>(build, 1000, max);
  // A list of "who did it" rows; null (shown as "—") when the read fails, e.g. a column a database update adds.
  const actorRows = (build: () => { range: (a: number, b: number) => PromiseLike<{ data: Row[] | null; error: unknown }> }) =>
    safe(async () => {
      const first = await build().range(0, 0);
      if (first.error) return null;
      return all(build);
    });
  const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch {
      return null;
    }
  };

  const [
    students,
    classes,
    applications,
    appsEnrolled,
    appsWaiting,
    inquiries,
    attendance,
    payments,
    expenses,
    invoicesIssued,
    openBalances,
    incidents,
    unresolvedIncidents,
    discipline,
    uniform,
    assignmentsSet,
    handedIn,
    marked,
    notesPublished,
    onlineClasses,
    onlineJoins,
    examAttempts,
    corrections,
    correctionsWaiting,
    announcements,
    jobApplications,
    messages,
    emails,
    staffProfiles,
    classLinks,
    subjectLinks,
    assignmentRows,
    markedRows,
    noteRows,
    starRows,
    majorRows,
    commentRows,
    publicationRows,
    decidedRows,
    unlockRows,
    classAssignRows,
    subjectAssignRows,
    announcementRows,
    chatReportRows,
    testUnlockRows,
    invoiceRows
  ] = await Promise.all([
    safe(() => all(() => supabase.from("students").select("id, status, level, first_name, last_name, created_at, updated_at").order("id"))),
    safe(async () => (await supabase.from("classes").select("id, level, name, active")).data as Row[] | null),
    safe(() =>
      all(() =>
        supabase.from("admissions_applications").select("id, section, created_at").gte("created_at", fromIso).lt("created_at", toIso).order("id")
      )
    ),
    countPair(
      (r) =>
        supabase
          .from("admissions_applications")
          .select("id", { count: "exact", head: true })
          .eq("status", "enrolled")
          .gte("updated_at", r.startIso)
          .lt("updated_at", r.endIsoExclusive),
      p
    ),
    supabase.from("admissions_applications").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    countPair(
      (r) => supabase.from("inquiries").select("id", { count: "exact", head: true }).gte("created_at", r.startIso).lt("created_at", r.endIsoExclusive),
      p
    ),
    safe(() =>
      all(() => supabase.from("student_attendance").select("id, date, status, class_id, recorded_by").gte("date", from).lte("date", p.end).order("id"), 200000)
    ),
    safe(() =>
      all(() =>
        supabase
          .from("finance_payment_transactions")
          .select("id, amount, method, provider, paid_at, received_by")
          .eq("direction", "inflow")
          .eq("status", "posted")
          .gte("paid_at", fromIso)
          .lt("paid_at", toIso)
          .order("id")
      )
    ),
    safe(() =>
      all(() =>
        supabase.from("finance_expenses").select("id, amount, spent_at, created_by, expense_categories(name)").gte("spent_at", fromIso).lt("spent_at", toIso).order("id")
      )
    ),
    safe(() =>
      all(() =>
        supabase
          .from("finance_invoice_balances")
          .select("invoice_id, invoice_total, issue_date")
          .neq("status", "void")
          .gte("issue_date", from)
          .lte("issue_date", p.end)
          .order("invoice_id")
      )
    ),
    safe(() =>
      all(() =>
        supabase
          .from("finance_invoice_balances")
          .select("invoice_id, balance, due_date, bill_to_guardian_id")
          .neq("status", "void")
          .gt("balance", 0)
          .order("invoice_id")
      )
    ),
    safe(() =>
      all(() =>
        supabase.from("welfare_incidents").select("id, severity, resolved, occurred_at, reported_by").gte("occurred_at", fromIso).lt("occurred_at", toIso).order("id")
      )
    ),
    supabase.from("welfare_incidents").select("id", { count: "exact", head: true }).eq("resolved", false),
    safe(() =>
      all(() =>
        supabase
          .from("welfare_discipline_records")
          .select("id, severity, occurred_at, reported_by")
          .gte("occurred_at", fromIso)
          .lt("occurred_at", toIso)
          .order("id")
      )
    ),
    safe(() => all(() => supabase.from("student_uniform_checks").select("id, date, ok").gte("date", from).lte("date", p.end).order("id"))),
    countPair(
      (r) => supabase.from("assignments").select("id", { count: "exact", head: true }).gte("created_at", r.startIso).lt("created_at", r.endIsoExclusive),
      p
    ),
    countPair(
      (r) =>
        supabase
          .from("assignment_submissions")
          .select("id", { count: "exact", head: true })
          .gte("submitted_at", r.startIso)
          .lt("submitted_at", r.endIsoExclusive),
      p
    ),
    countPair(
      (r) =>
        supabase.from("assignment_submissions").select("id", { count: "exact", head: true }).gte("marked_at", r.startIso).lt("marked_at", r.endIsoExclusive),
      p
    ),
    countPair(
      (r) =>
        supabase
          .from("lesson_notes")
          .select("id", { count: "exact", head: true })
          .eq("status", "published")
          .gte("published_at", r.startIso)
          .lt("published_at", r.endIsoExclusive),
      p
    ),
    safe(() =>
      all(() => supabase.from("online_classes").select("id, status, starts_at, created_by").gte("starts_at", fromIso).lt("starts_at", toIso).order("id"))
    ),
    countPair(
      (r) =>
        supabase.from("online_class_attendance").select("student_id", { count: "exact", head: true }).gte("joined_at", r.startIso).lt("joined_at", r.endIsoExclusive),
      p
    ),
    safe(() =>
      all(() => supabase.from("exam_attempts").select("id, percent, submitted_at").gte("submitted_at", fromIso).lt("submitted_at", toIso).order("id"))
    ),
    countPair(
      (r) =>
        supabase
          .from("result_correction_requests")
          .select("id", { count: "exact", head: true })
          .gte("requested_at", r.startIso)
          .lt("requested_at", r.endIsoExclusive),
      p
    ),
    supabase.from("result_correction_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
    countPair(
      (r) => supabase.from("announcements").select("id", { count: "exact", head: true }).gte("created_at", r.startIso).lt("created_at", r.endIsoExclusive),
      p
    ),
    countPair(
      (r) =>
        supabase.from("career_applications").select("id", { count: "exact", head: true }).gte("created_at", r.startIso).lt("created_at", r.endIsoExclusive),
      p
    ),
    service
      ? countPair(
          (r) =>
            service
              .from("chat_messages")
              .select("id", { count: "exact", head: true })
              .is("removed_at", null)
              .gte("created_at", r.startIso)
              .lt("created_at", r.endIsoExclusive),
          p
        )
      : Promise.resolve({ cur: null, prev: null }),
    service
      ? countPair(
          (r) =>
            service
              .from("email_outbox")
              .select("id", { count: "exact", head: true })
              .eq("status", "sent")
              .gte("sent_at", r.startIso)
              .lt("sent_at", r.endIsoExclusive),
          p
        )
      : Promise.resolve({ cur: null, prev: null }),
    // ---- Staff: accounts, assignments and who recorded what ----
    safe(() =>
      all(() => supabase.from("profiles").select("id, role, full_name, email, created_at").in("role", STAFF_ROLES).order("id"))
    ),
    safe(async () => (await supabase.from("teacher_class_assignments").select("teacher_id").eq("active", true)).data as Row[] | null),
    safe(async () => (await supabase.from("teacher_subject_assignments").select("teacher_id").eq("active", true)).data as Row[] | null),
    safe(() =>
      all(() => supabase.from("assignments").select("id, created_by, created_at").gte("created_at", fromIso).lt("created_at", toIso).order("id"))
    ),
    safe(() =>
      all(() =>
        supabase.from("assignment_submissions").select("id, marked_by, marked_at").gte("marked_at", fromIso).lt("marked_at", toIso).order("id")
      )
    ),
    safe(() =>
      all(() =>
        supabase
          .from("lesson_notes")
          .select("id, created_by, published_at")
          .eq("status", "published")
          .gte("published_at", fromIso)
          .lt("published_at", toIso)
          .order("id")
      )
    ),
    // ---- Star of the week videos (20261112_star_videos.sql); null until that update is run ----
    safe(async () => {
      const { data, error } = await supabase
        .from("star_videos")
        .select("id, class_id, subject_id, student_id, week_start, video_url, author_name, created_by, created_at")
        .gte("week_start", from)
        .lte("week_start", p.end)
        .limit(5000);
      return error ? null : (data as Row[]);
    }),
    safe(async () => {
      const { data, error } = await supabase.from("class_subjects").select("class_id, subject_id, subjects(name)").eq("is_major", true);
      return error ? null : (data as Row[]);
    }),
    // ---- Heads' actions: records that say who did them (null when a read fails) ----
    actorRows(() =>
      supabase.from("report_card_comments").select("id, updated_by, updated_at").not("head_comment", "is", null).gte("updated_at", fromIso).lt("updated_at", toIso).order("id")
    ),
    actorRows(() => supabase.from("result_publications").select("id, published_by, published_at").gte("published_at", fromIso).lt("published_at", toIso).order("id")),
    actorRows(() =>
      supabase.from("result_correction_requests").select("id, decided_by, decided_at, requested_at").gte("decided_at", fromIso).lt("decided_at", toIso).order("id")
    ),
    actorRows(() => supabase.from("result_audit_log").select("id, actor_id, at").eq("action", "sheet_unlocked").gte("at", fromIso).lt("at", toIso).order("id")),
    actorRows(() =>
      supabase.from("teacher_class_assignments").select("teacher_id, class_id, assigned_by, created_at").gte("created_at", fromIso).lt("created_at", toIso).order("class_id")
    ),
    actorRows(() =>
      supabase.from("teacher_subject_assignments").select("teacher_id, class_id, subject_id, assigned_by, created_at").gte("created_at", fromIso).lt("created_at", toIso).order("class_id")
    ),
    actorRows(() => supabase.from("announcements").select("id, created_by, created_at").gte("created_at", fromIso).lt("created_at", toIso).order("id")),
    actorRows(() => supabase.from("chat_reports").select("id, resolved_by, resolved_at").gte("resolved_at", fromIso).lt("resolved_at", toIso).order("id")),
    actorRows(() => supabase.from("exam_attempts").select("id, unlocked_by, unlocked_at").gte("unlocked_at", fromIso).lt("unlocked_at", toIso).order("id")),
    actorRows(() => supabase.from("finance_invoices").select("id, created_by, created_at").gte("created_at", fromIso).lt("created_at", toIso).order("id"))
  ]);

  const classById = new Map<string, { level: string; name: string; active: boolean }>();
  for (const c of classes ?? []) classById.set(String(c.id), { level: String(c.level), name: String(c.name), active: c.active !== false });
  const activeClasses = [...classById.values()].filter((c) => c.active).length;

  const pair = (rows: Row[] | null, dateKey: string, pick: (r: Row) => number = () => 1) => {
    if (!rows) return { cur: null as number | null, prev: null as number | null };
    let cur = 0;
    let prev = 0;
    for (const r of rows) {
      const b = bucketOf(p, r[dateKey] as string | null);
      if (b === "cur") cur += pick(r);
      else if (b === "prev") prev += pick(r);
    }
    return { cur, prev };
  };
  const m = (label: string, v: { cur: number | null; prev: number | null }, format: MiFormat, better: MiMetric["better"], hint?: string, id?: string): MiMetric => ({
    id,
    label,
    current: v.cur,
    previous: v.prev,
    format,
    better,
    hint
  });

  // ---------- Pupils and admissions ----------
  const onRoll = students ? students.filter((s) => ON_ROLL.includes(String(s.status))) : null;
  const newPupils = pair(students && students.filter((s) => ON_ROLL.includes(String(s.status))), "created_at");
  const leavers = pair(students && students.filter((s) => LEFT.includes(String(s.status))), "updated_at");
  const newApplications = pair(applications, "created_at");
  const bySection = (rows: Row[] | null, key: string) => {
    const out: Record<string, number> = {};
    for (const r of rows ?? []) {
      const k = String(r[key] ?? "other");
      out[k] = (out[k] ?? 0) + 1;
    }
    return out;
  };
  const rollBySection = bySection(onRoll, "level");
  const curApps = applications?.filter((a) => bucketOf(p, a.created_at as string) === "cur") ?? null;
  const appsBySection = bySection(curApps, "section");

  const pupils: MiSection = {
    key: "pupils",
    title: "Pupils and admissions",
    description: "Who joined, who left, and how many families asked about a place.",
    metrics: [
      m("New admission enquiries", newApplications, "count", "up", "Started on the website or added by the front desk", "enquiries"),
      m("Applications marked enrolled", appsEnrolled, "count", "up"),
      m("New pupils added", newPupils, "count", "up"),
      m("Pupils marked as left", leavers, "count", "down", "Withdrawn, transferred or graduated"),
      m("Website contact messages", inquiries, "count", "up")
    ],
    snapshots: [
      { id: "onRoll", label: "Pupils on roll", value: onRoll ? onRoll.length : null, format: "count" },
      { label: "Applications waiting for a reply", value: appsWaiting.error ? null : (appsWaiting.count ?? 0), format: "count" }
    ],
    tables: [
      {
        title: "By section",
        columns: ["Section", "Pupils on roll", "New enquiries"],
        rows: ["creche", "primary", "secondary"].map((s) => [
          SECTION_NAMES[s],
          formatMi(onRoll ? (rollBySection[s] ?? 0) : null, "count"),
          formatMi(curApps ? (appsBySection[s] ?? 0) : null, "count")
        ]),
        empty: "No pupils yet."
      }
    ],
    unavailable: students ? undefined : "Pupil records could not be read just now.",
    link: { href: "/admin/students/applications", label: "Open applications" }
  };

  // ---------- Attendance ----------
  const att = { cur: { marked: 0, present: 0, late: 0, absent: 0, excused: 0 }, prev: { marked: 0, present: 0, late: 0, absent: 0, excused: 0 } };
  const classAtt = new Map<string, { marked: { cur: number; prev: number }; came: { cur: number; prev: number }; days: Set<string> }>();
  const registers = { cur: new Set<string>(), prev: new Set<string>() };
  for (const r of attendance ?? []) {
    const b = bucketOf(p, r.date as string);
    if (!b) continue;
    const status = String(r.status);
    const t = att[b];
    t.marked++;
    if (status === "present" || status === "late" || status === "absent" || status === "excused") t[status]++;
    const cid = String(r.class_id ?? "none");
    registers[b].add(`${cid}|${r.date}`);
    const c = classAtt.get(cid) ?? { marked: { cur: 0, prev: 0 }, came: { cur: 0, prev: 0 }, days: new Set<string>() };
    c.marked[b]++;
    if (status === "present" || status === "late") c.came[b]++;
    if (b === "cur") c.days.add(String(r.date));
    classAtt.set(cid, c);
  }
  const attRate = (t: typeof att.cur) => pct(t.present + t.late, t.marked);
  const hasAtt = attendance !== null;
  const schoolDays = { cur: weekdaysBetween(p.start, p.end), prev: weekdaysBetween(p.previous.start, p.previous.end) };
  const sectionAtt = (level: string, b: "cur" | "prev") => {
    let marked = 0;
    let came = 0;
    for (const [cid, c] of classAtt) {
      if (classById.get(cid)?.level !== level) continue;
      marked += c.marked[b];
      came += c.came[b];
    }
    return pct(came, marked);
  };
  const lowClasses = [...classAtt.entries()]
    .filter(([, c]) => c.marked.cur >= 5)
    .map(([cid, c]) => ({ cid, rate: pct(c.came.cur, c.marked.cur) ?? 0, prev: pct(c.came.prev, c.marked.prev), days: c.days.size }))
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 5);

  const attendanceSection: MiSection = {
    key: "attendance",
    title: "Attendance",
    description: "From the daily registers. Attendance = pupils present or late ÷ pupils marked.",
    metrics: [
      m("Attendance", { cur: hasAtt ? attRate(att.cur) : null, prev: hasAtt ? attRate(att.prev) : null }, "percent", "up", undefined, "attendance"),
      m("Absences", { cur: hasAtt ? att.cur.absent + att.cur.excused : null, prev: hasAtt ? att.prev.absent + att.prev.excused : null }, "count", "down", "Including excused"),
      m("Late arrivals", { cur: hasAtt ? att.cur.late : null, prev: hasAtt ? att.prev.late : null }, "count", "down"),
      m(
        "Registers taken",
        { cur: hasAtt ? pct(registers.cur.size, activeClasses * schoolDays.cur) : null, prev: hasAtt ? pct(registers.prev.size, activeClasses * schoolDays.prev) : null },
        "percent",
        "up",
        `Class registers marked ÷ (${activeClasses} classes × school days, Monday to Friday)`
      )
    ],
    tables: [
      {
        title: "By section",
        columns: ["Section", "Attendance", p.previousWord[0].toUpperCase() + p.previousWord.slice(1)],
        rows: ["creche", "primary", "secondary"].map((s) => [SECTION_NAMES[s], formatMi(sectionAtt(s, "cur"), "percent"), formatMi(sectionAtt(s, "prev"), "percent")]),
        empty: "No registers taken."
      },
      {
        title: "Lowest attendance by class",
        columns: ["Class", "Attendance", p.previousWord[0].toUpperCase() + p.previousWord.slice(1), "Days marked"],
        rows: lowClasses.map((c) => [className(classById.get(c.cid)), formatMi(c.rate, "percent"), formatMi(c.prev, "percent"), String(c.days)]),
        empty: "No registers taken in this period."
      }
    ],
    unavailable: hasAtt ? undefined : "Attendance could not be read just now.",
    link: { href: "/admin/welfare/attendance", label: "Open attendance" }
  };

  // ---------- Money ----------
  const amount = (r: Row) => Number(r.amount ?? 0);
  const collected = pair(payments, "paid_at", amount);
  const paymentCount = pair(payments, "paid_at");
  const spent = pair(expenses, "spent_at", amount);
  const invoiced = pair(invoicesIssued, "issue_date", (r) => Number(r.invoice_total ?? 0));
  const outstanding = openBalances ? openBalances.reduce((a, r) => a + Number(r.balance ?? 0), 0) : null;
  const overdueRows = openBalances?.filter((r) => r.due_date && String(r.due_date) < today) ?? null;
  const overdue = overdueRows ? overdueRows.reduce((a, r) => a + Number(r.balance ?? 0), 0) : null;
  const familiesOwing = openBalances ? new Set(openBalances.map((r) => String(r.bill_to_guardian_id))).size : null;
  const net = { cur: collected.cur !== null && spent.cur !== null ? collected.cur - spent.cur : null, prev: collected.prev !== null && spent.prev !== null ? collected.prev - spent.prev : null };

  const methodLabel = (r: Row) => {
    if (r.provider === "bank") return "Bank transfer (from bank statement or alert)";
    if (r.provider === "moniepoint") return "Online (Moniepoint)";
    const mth = String(r.method ?? "").trim().toLowerCase();
    const known: Record<string, string> = { transfer: "Bank transfer", bank_transfer: "Bank transfer", pos: "POS / card", card: "POS / card", cash: "Cash", cheque: "Cheque", online: "Online" };
    return known[mth] ?? (mth ? mth[0].toUpperCase() + mth.slice(1).replace(/_/g, " ") : "Not stated");
  };
  const byMethod = new Map<string, { n: number; total: number }>();
  for (const r of payments ?? []) {
    if (bucketOf(p, r.paid_at as string) !== "cur") continue;
    const k = methodLabel(r);
    const e = byMethod.get(k) ?? { n: 0, total: 0 };
    e.n++;
    e.total += amount(r);
    byMethod.set(k, e);
  }
  const byCategory = new Map<string, number>();
  for (const r of expenses ?? []) {
    if (bucketOf(p, r.spent_at as string) !== "cur") continue;
    const cat = r.expense_categories as { name?: string } | Array<{ name?: string }> | null;
    const name = (Array.isArray(cat) ? cat[0]?.name : cat?.name) ?? "Uncategorised";
    byCategory.set(name, (byCategory.get(name) ?? 0) + amount(r));
  }

  const money: MiSection = {
    key: "money",
    title: "Fees and money",
    description: "Money received and spent in the period, and what families still owe today.",
    metrics: [
      m("Fees collected", collected, "money", "up", undefined, "collected"),
      m("Payments received", paymentCount, "count", "up"),
      m("Invoiced", invoiced, "money", "none", "Invoices dated in the period"),
      m("Spent (expenses recorded)", spent, "money", "down", undefined, "spent"),
      m("Collected minus spent", net, "money", "up")
    ],
    snapshots: [
      { id: "owed", label: "Still owed", value: outstanding, format: "money" },
      { id: "overdue", label: "Of which overdue", value: overdue, format: "money", hint: "Past the invoice due date" },
      { label: "Families owing", value: familiesOwing, format: "count" }
    ],
    tables: [
      {
        title: "How fees were paid",
        columns: ["Way of paying", "Payments", "Amount"],
        rows: [...byMethod.entries()].sort((a, b) => b[1].total - a[1].total).map(([k, v]) => [k, String(v.n), formatMi(v.total, "money")]),
        empty: "No payments in this period."
      },
      {
        title: "Biggest spending",
        columns: ["Category", "Amount"],
        rows: [...byCategory.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => [k, formatMi(v, "money")]),
        empty: "No expenses recorded in this period."
      }
    ],
    unavailable: payments ? undefined : "Money records could not be read just now.",
    link: { href: "/admin/finance/debtors", label: "Open debtors" }
  };

  // ---------- Welfare and behaviour ----------
  const incidentCount = pair(incidents, "occurred_at");
  const serious = pair(incidents, "occurred_at", (r) => (Number(r.severity ?? 1) >= 4 ? 1 : 0));
  const disciplineCount = pair(discipline, "occurred_at");
  const uniformChecked = pair(uniform, "date");
  const uniformFailed = pair(uniform, "date", (r) => (r.ok === false ? 1 : 0));
  const unresolved = unresolvedIncidents.error ? null : (unresolvedIncidents.count ?? 0);

  const welfare: MiSection = {
    key: "welfare",
    title: "Welfare and behaviour",
    description: "Health and safety incidents, discipline and uniform checks recorded by staff.",
    metrics: [
      m("Health and safety incidents", incidentCount, "count", "down", undefined, "incidents"),
      m("Serious incidents (severity 4–5)", serious, "count", "down"),
      m("Discipline records", disciplineCount, "count", "down"),
      m(
        "Uniform checks passed",
        {
          cur: uniformChecked.cur ? pct(uniformChecked.cur - (uniformFailed.cur ?? 0), uniformChecked.cur) : null,
          prev: uniformChecked.prev ? pct(uniformChecked.prev - (uniformFailed.prev ?? 0), uniformChecked.prev) : null
        },
        "percent",
        "up"
      )
    ],
    snapshots: [{ id: "unresolved", label: "Incidents not yet resolved", value: unresolved, format: "count", hint: "All dates" }],
    unavailable: incidents ? undefined : "Welfare records could not be read just now.",
    link: { href: "/admin/welfare/incidents", label: "Open incidents" }
  };

  // ---------- Teaching and learning ----------
  const heldPick = (r: Row) => (r.status !== "cancelled" && String(r.starts_at) <= new Date().toISOString() ? 1 : 0);
  const classesHeld = pair(onlineClasses, "starts_at", heldPick);
  const classesCancelled = pair(onlineClasses, "starts_at", (r) => (r.status === "cancelled" ? 1 : 0));
  const examsSat = pair(examAttempts, "submitted_at");
  const examTotal = pair(examAttempts, "submitted_at", (r) => Number(r.percent ?? 0));
  const examAvg = {
    cur: examsSat.cur ? Math.round(((examTotal.cur ?? 0) / examsSat.cur) * 10) / 10 : null,
    prev: examsSat.prev ? Math.round(((examTotal.prev ?? 0) / examsSat.prev) * 10) / 10 : null
  };
  const waitingCorrections = correctionsWaiting.error ? null : (correctionsWaiting.count ?? 0);

  const teaching: MiSection = {
    key: "teaching",
    title: "Teaching and learning",
    description: "Work set and marked, lesson notes, online classes and computer-based tests.",
    metrics: [
      m("Assignments and classwork set", assignmentsSet, "count", "up"),
      m("Pieces of work handed in", handedIn, "count", "up", undefined, "handedIn"),
      m("Pieces of work marked", marked, "count", "up"),
      m("Lesson notes published", notesPublished, "count", "up"),
      m("Online classes held", classesHeld, "count", "up"),
      m("Online classes cancelled", classesCancelled, "count", "down"),
      m("Pupils who joined an online class", onlineJoins, "count", "up", "Each pupil counted once per class"),
      m("Computer-based tests taken", examsSat, "count", "none"),
      m("Average test score", examAvg, "percent", "up"),
      m("Result correction requests", corrections, "count", "down")
    ],
    snapshots: [{ label: "Correction requests waiting for a decision", value: waitingCorrections, format: "count" }],
    link: { href: "/admin/academics/corrections", label: "Open correction requests" }
  };

  // ---------- Communication ----------
  const communication: MiSection = {
    key: "communication",
    title: "Communication",
    description: "How much the school and families talked through the portal.",
    metrics: [
      m("School announcements", announcements, "count", "none"),
      m("Emails sent", emails, "count", "none", "Notifications, messages and announcements by email"),
      m("Portal messages", messages, "count", "none", "Between teachers and parents, and in class chats")
    ],
    link: { href: "/admin/announcements", label: "Open announcements" }
  };

  // ---------- Star of the week videos ----------
  // Expected: every active class, one video per major subject (at most two), each week that starts in the period.
  const subjectNameOf = (r: Row) => {
    const sj = r.subjects as { name?: string } | Array<{ name?: string }> | null;
    return (Array.isArray(sj) ? sj[0]?.name : sj?.name) ?? "Subject";
  };
  const majorsBy = new Map<string, Array<{ id: string; name: string }>>();
  for (const r of majorRows ?? []) {
    const cid = String(r.class_id);
    if (!classById.get(cid)?.active) continue;
    majorsBy.set(cid, [...(majorsBy.get(cid) ?? []), { id: String(r.subject_id), name: subjectNameOf(r) }].sort((a, b) => a.name.localeCompare(b.name)));
  }
  const majorSlots = [...majorsBy.values()].reduce((a, ms) => a + ms.length, 0);
  const mondays = (a: string, b: string) => {
    let n = 0;
    for (let d = a; d <= b; d = addDays(d, 1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() === 1) n++;
    return n;
  };
  const isSlot = (r: Row) => (majorsBy.get(String(r.class_id)) ?? []).some((m) => m.id === String(r.subject_id));
  // While the period is running, last period only counts videos that were in by the same point (posted by the same
  // day), so a half-finished week isn't compared with a finished one.
  const inByThen = (r: Row) =>
    !p.inProgress || bucketOf(p, r.week_start as string) !== "prev" || !r.created_at || String(r.created_at) < p.previous.endIsoExclusive;
  const starsPosted = pair(starRows && starRows.filter((r) => isSlot(r) && inByThen(r)), "week_start");
  const expected = { cur: majorSlots * mondays(p.start, p.end), prev: majorSlots * mondays(p.previous.start, p.previous.end) };
  const starRate = {
    cur: starRows && expected.cur ? pct(starsPosted.cur ?? 0, expected.cur) : null,
    prev: starRows && expected.prev ? pct(starsPosted.prev ?? 0, expected.prev) : null
  };
  const classOrder = (a: string, b: string) => {
    const ca = classById.get(a);
    const cb = classById.get(b);
    const lv = ["creche", "primary", "secondary"];
    return lv.indexOf(ca?.level ?? "") - lv.indexOf(cb?.level ?? "") || (ca?.name ?? "").localeCompare(cb?.name ?? "", undefined, { numeric: true });
  };
  const studentName = new Map((students ?? []).map((s) => [String(s.id), `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim()] as const));
  const curStars = (starRows ?? []).filter((r) => bucketOf(p, r.week_start as string) === "cur");
  const missingSlots: string[] = [];
  const starTable: MiTable =
    p.view === "week"
      ? {
          title: "This week's star videos",
          columns: ["Class", "Subject", "Pupil", "Video", "Posted by"],
          rows: [...majorsBy.entries()]
            .sort((a, b) => classOrder(a[0], b[0]))
            .flatMap(([cid, ms]) =>
              ms.map((m) => {
                const v = curStars.find((r) => String(r.class_id) === cid && String(r.subject_id) === m.id);
                if (!v) missingSlots.push(`${className(classById.get(cid))} (${m.name})`);
                return v
                  ? ([
                      className(classById.get(cid)),
                      m.name,
                      studentName.get(String(v.student_id)) || "A pupil",
                      { text: `Watch on ${videoHost(String(v.video_url))}`, href: String(v.video_url) },
                      String(v.author_name ?? "—")
                    ] as MiCell[])
                  : ([className(classById.get(cid)), m.name, "Not posted", "—", "—"] as MiCell[]);
              })
            ),
          empty: "No class has major subjects yet. An admin chooses them on Class subjects.",
          wide: true
        }
      : {
          title: "Videos by class",
          columns: ["Class", "Major subjects", "Posted", "Expected"],
          rows: [...majorsBy.entries()]
            .sort((a, b) => classOrder(a[0], b[0]))
            .map(([cid, ms]) => {
              const posted = curStars.filter((r) => String(r.class_id) === cid && ms.some((m) => m.id === String(r.subject_id))).length;
              const exp = ms.length * mondays(p.start, p.end);
              if (posted < exp) missingSlots.push(className(classById.get(cid)));
              return [className(classById.get(cid)), ms.map((m) => m.name).join(", "), String(posted), String(exp)];
            }),
          empty: "No class has major subjects yet. An admin chooses them on Class subjects."
        };
  const noMajors = [...classById.entries()].filter(([cid, c]) => c.active && !majorsBy.has(cid)).length;

  const starSection: MiSection = {
    key: "stars",
    title: "Star of the week videos",
    description: "Each week every class shares a video of a pupil who did well in each of its two major subjects.",
    metrics: [
      m("Videos posted", starsPosted, "count", "up"),
      m("Videos posted of those expected", starRate, "percent", "up", "Classes × their major subjects × weeks in the period", "starVideosRate")
    ],
    snapshots: [{ id: "noMajors", label: "Classes with no major subjects chosen", value: majorRows ? noMajors : null, format: "count" }],
    tables: [starTable],
    unavailable: starRows && majorRows ? undefined : "Star videos need a database update (20261112_star_videos.sql).",
    link: { href: "/admin/academics/star-videos", label: "Open star videos" }
  };

  // ---------- Staff ----------
  // Work is credited to whoever recorded it (registers: recorded_by; work set, lesson notes, online classes:
  // created_by; marking: marked_by). There are no staff attendance or leave records in the system yet.
  type Tally = { registers: Set<string>; set: number; marked: number; notes: number; online: number; stars: number };
  const blank = (): Tally => ({ registers: new Set<string>(), set: 0, marked: 0, notes: 0, online: 0, stars: 0 });
  const work = { cur: new Map<string, Tally>(), prev: new Map<string, Tally>() };
  const tally = (b: Bucket, who: unknown) => {
    if (!b || !who) return null;
    const k = String(who);
    const t = work[b].get(k) ?? blank();
    work[b].set(k, t);
    return t;
  };
  for (const r of attendance ?? []) tally(bucketOf(p, r.date as string), r.recorded_by)?.registers.add(`${r.class_id}|${r.date}`);
  for (const r of assignmentRows ?? []) {
    const t = tally(bucketOf(p, r.created_at as string), r.created_by);
    if (t) t.set++;
  }
  for (const r of markedRows ?? []) {
    const t = tally(bucketOf(p, r.marked_at as string), r.marked_by);
    if (t) t.marked++;
  }
  for (const r of noteRows ?? []) {
    const t = tally(bucketOf(p, r.published_at as string), r.created_by);
    if (t) t.notes++;
  }
  for (const r of starRows ?? []) {
    const t = tally(bucketOf(p, r.week_start as string), r.created_by);
    if (t) t.stars++;
  }
  for (const r of onlineClasses ?? []) {
    if (!heldPick(r)) continue;
    const t = tally(bucketOf(p, r.starts_at as string), r.created_by);
    if (t) t.online++;
  }
  const total = (t: Tally | undefined) => (t ? t.registers.size + t.set + t.marked + t.notes + t.online + t.stars : 0);

  const staffList = staffProfiles ?? null;
  const teachers = (staffList ?? []).filter((s) => s.role === "teacher");
  const assigned = new Set([...(classLinks ?? []), ...(subjectLinks ?? [])].map((r) => String(r.teacher_id)));
  const unassigned = teachers.filter((t) => !assigned.has(String(t.id)));
  const personName = (s: Row) => String(s.full_name || s.email || "Unnamed account");
  const activeTeachers = (b: "cur" | "prev") => teachers.filter((t) => total(work[b].get(String(t.id))) > 0).length;
  const quietTeachers = teachers.filter((t) => assigned.has(String(t.id)) && total(work.cur.get(String(t.id))) === 0);
  const byRole = bySection(staffList, "role");
  const newStaff = pair(staffList, "created_at");
  const teacherRows = teachers
    .map((t) => {
      const c = work.cur.get(String(t.id));
      const pv = work.prev.get(String(t.id));
      return { t, c, total: total(c), prevTotal: total(pv) };
    })
    .sort((a, b) => a.total - b.total || personName(a.t).localeCompare(personName(b.t)));

  const staffSection: MiSection = {
    key: "staff",
    title: "Staff",
    description:
      "Staff accounts and the work each teacher recorded in the system. Staff attendance and leave aren't recorded in the system yet.",
    metrics: [
      m("Teachers who recorded work", { cur: staffList ? activeTeachers("cur") : null, prev: staffList ? activeTeachers("prev") : null }, "count", "up", "Took a register, set or marked work, published a lesson note, held an online class or posted a star video", "teachersActive"),
      m("Class registers taken", pair(attendance && [...new Map(attendance.map((r) => [`${r.class_id}|${r.date}`, r])).values()], "date"), "count", "up"),
      m("New staff accounts", newStaff, "count", "none"),
      m("Job applications received", jobApplications, "count", "none")
    ],
    snapshots: [
      { id: "staff", label: "Staff with an account", value: staffList ? staffList.length : null, format: "count" },
      { id: "teachers", label: "Teachers", value: staffList ? teachers.length : null, format: "count" },
      { id: "unassigned", label: "Teachers with no class or subject", value: staffList && classLinks && subjectLinks ? unassigned.length : null, format: "count", hint: "Can't enter results or registers" }
    ],
    tables: [
      {
        title: "Staff by role",
        columns: ["Role", "Accounts"],
        rows: STAFF_ROLES.filter((r) => byRole[r]).map((r) => [ROLE_NAMES[r], String(byRole[r])]),
        empty: "No staff accounts."
      },
      {
        title: "Teachers with no class or subject",
        columns: ["Teacher", "Account added"],
        rows: unassigned.map((t) => [personName(t), formatLagosDate(String(t.created_at))]),
        empty: "Every teacher has a class or a subject."
      },
      {
        title: "Work recorded by each teacher (least first)",
        columns: ["Teacher", "Registers", "Work set", "Marked", "Lesson notes", "Online classes", "Star videos", "Total", p.previousWord[0].toUpperCase() + p.previousWord.slice(1)],
        rows: teacherRows.map(({ t, c, total: n, prevTotal }) => [
          `${personName(t)}${assigned.has(String(t.id)) ? "" : " (not assigned)"}`,
          String(c?.registers.size ?? 0),
          String(c?.set ?? 0),
          String(c?.marked ?? 0),
          String(c?.notes ?? 0),
          String(c?.online ?? 0),
          String(c?.stars ?? 0),
          String(n),
          String(prevTotal)
        ]),
        empty: "No teacher accounts yet.",
        wide: true
      }
    ],
    unavailable: staffList ? undefined : "Staff accounts could not be read just now.",
    link: { href: "/admin/users", label: "Open staff & users" }
  };

  // ---------- Heads' actions ----------
  // Leadership is every admin and super admin account. Each figure counts records those people created in the
  // period, found by the record's "who" column; nothing is typed into the pack.
  const heads = (staffList ?? []).filter((s) => s.role === "admin" || s.role === "super_admin");
  const headIds = new Set(heads.map((h) => String(h.id)));
  const { data: headMessageData, error: headMessageError } =
    service && headIds.size
      ? await service
          .from("chat_messages")
          .select("id, sender_id, created_at")
          .in("sender_id", [...headIds])
          .is("removed_at", null)
          .gte("created_at", fromIso)
          .lt("created_at", toIso)
          .limit(20000)
      : { data: null, error: null };
  const headMessages = service && !headMessageError ? ((headMessageData ?? []) as Row[]) : null;

  type ActionKind = { key: string; label: string; group: "learners" | "results" | "staff" | "parents" | "money"; rows: Row[] | null; who: string; when: string; hint?: string };
  const kinds: ActionKind[] = [
    { key: "incidents", label: "Incidents and discipline recorded", group: "learners", rows: incidents && discipline ? [...incidents, ...discipline] : null, who: "reported_by", when: "occurred_at" },
    { key: "testUnlocks", label: "Pupils' computer tests unlocked", group: "learners", rows: testUnlockRows, who: "unlocked_by", when: "unlocked_at" },
    { key: "stars", label: "Star videos posted", group: "learners", rows: starRows, who: "created_by", when: "week_start" },
    { key: "comments", label: "Head's report card comments written", group: "results", rows: commentRows, who: "updated_by", when: "updated_at" },
    { key: "published", label: "Results published", group: "results", rows: publicationRows, who: "published_by", when: "published_at" },
    { key: "decided", label: "Result correction requests decided", group: "results", rows: decidedRows, who: "decided_by", when: "decided_at" },
    { key: "unlocked", label: "Locked result sheets reopened", group: "results", rows: unlockRows, who: "actor_id", when: "at" },
    {
      key: "assigned",
      label: "Teachers assigned to classes or subjects",
      group: "staff",
      rows: classAssignRows && subjectAssignRows ? [...classAssignRows, ...subjectAssignRows] : null,
      who: "assigned_by",
      when: "created_at",
      hint: classAssignRows ? undefined : "Needs the database update 20261113_record_who_did_what.sql"
    },
    { key: "reports", label: "Reported messages dealt with", group: "staff", rows: chatReportRows, who: "resolved_by", when: "resolved_at" },
    { key: "messages", label: "Messages sent to parents and staff", group: "parents", rows: headMessages, who: "sender_id", when: "created_at" },
    { key: "announcements", label: "School announcements sent", group: "parents", rows: announcementRows, who: "created_by", when: "created_at" },
    {
      key: "money",
      label: "Payments, expenses and invoices recorded",
      group: "money",
      rows: payments && expenses && invoiceRows ? [...payments.map((r) => ({ ...r, by: r.received_by, on: r.paid_at })), ...expenses.map((r) => ({ ...r, by: r.created_by, on: r.spent_at })), ...invoiceRows.map((r) => ({ ...r, by: r.created_by, on: r.created_at }))] : null,
      who: "by",
      when: "on"
    }
  ];
  // Per head, per kind, per period.
  const perHead = new Map<string, Record<string, { cur: number; prev: number }>>();
  const kindTotals = new Map<string, { cur: number | null; prev: number | null }>();
  for (const k of kinds) {
    if (!k.rows) {
      kindTotals.set(k.key, { cur: null, prev: null });
      continue;
    }
    const t = { cur: 0, prev: 0 };
    for (const r of k.rows) {
      const who = String(r[k.who] ?? "");
      if (!headIds.has(who)) continue;
      const b = bucketOf(p, r[k.when] as string);
      if (!b) continue;
      t[b]++;
      const h = perHead.get(who) ?? {};
      h[k.key] = h[k.key] ?? { cur: 0, prev: 0 };
      h[k.key][b]++;
      perHead.set(who, h);
    }
    kindTotals.set(k.key, t);
  }
  const sumAll = (b: "cur" | "prev") => [...kindTotals.values()].reduce((a, v) => a + (v[b] ?? 0), 0);
  const decideHours = (b: "cur" | "prev") => {
    const rows = (decidedRows ?? []).filter((r) => headIds.has(String(r.decided_by ?? "")) && bucketOf(p, r.decided_at as string) === b && r.requested_at);
    if (!rows.length) return null;
    const hours = rows.reduce((a, r) => a + (new Date(String(r.decided_at)).getTime() - new Date(String(r.requested_at)).getTime()) / 3600000, 0) / rows.length;
    return Math.round(hours);
  };
  const groupSum = (h: Record<string, { cur: number; prev: number }> | undefined, group: ActionKind["group"], b: "cur" | "prev") =>
    kinds.filter((k) => k.group === group).reduce((a, k) => a + (h?.[k.key]?.[b] ?? 0), 0);
  const groups: Array<[ActionKind["group"], string]> = [
    ["learners", "Pupils"],
    ["results", "Results"],
    ["staff", "Staff"],
    ["parents", "Messages"],
    ["money", "Money"]
  ];
  const headRows = heads
    .map((h) => {
      const rec = perHead.get(String(h.id));
      const cur = groups.reduce((a, [g]) => a + groupSum(rec, g, "cur"), 0);
      const prev = groups.reduce((a, [g]) => a + groupSum(rec, g, "prev"), 0);
      return { h, rec, cur, prev };
    })
    .sort((a, b) => b.cur - a.cur || personName(a.h).localeCompare(personName(b.h)));
  const avgDecide = { cur: decideHours("cur"), prev: decideHours("prev") };

  const headsSection: MiSection = {
    key: "heads",
    title: "Heads' actions",
    description:
      "What the school's heads (admin accounts) did in the system to manage pupils and staff, counted from the records themselves.",
    metrics: [
      m("All actions by heads", { cur: staffList ? sumAll("cur") : null, prev: staffList ? sumAll("prev") : null }, "count", "none", undefined, "headActions"),
      ...kinds.map((k) => m(k.label, kindTotals.get(k.key) ?? { cur: null, prev: null }, "count", "none", k.hint)),
      m("Average hours to decide a correction request", avgDecide, "count", "down", "From the teacher's request to the head's decision")
    ],
    snapshots: [{ id: "heads", label: "Heads (admin accounts)", value: staffList ? heads.length : null, format: "count" }],
    tables: [
      {
        title: "Actions by each head",
        columns: ["Head", ...groups.map(([, l]) => l), "Total", p.previousWord[0].toUpperCase() + p.previousWord.slice(1)],
        rows: headRows.map(({ h, rec, cur, prev }) => [personName(h), ...groups.map(([g]) => String(groupSum(rec, g, "cur"))), String(cur), String(prev)]),
        empty: "No admin accounts.",
        wide: true
      }
    ],
    unavailable: staffList ? undefined : "Staff accounts could not be read just now.",
    link: { href: "/admin/users", label: "Open staff & users" }
  };

  // ---------- Things to look at ----------
  const notes: MiNote[] = [];
  const word = p.previousWord;
  const curRate = hasAtt ? attRate(att.cur) : null;
  const prevRate = hasAtt ? attRate(att.prev) : null;
  if (curRate !== null && curRate < 90) notes.push({ tone: "warning", text: `Attendance is ${formatMi(curRate, "percent")}, below the 90% the school aims for.` });
  if (curRate !== null && prevRate !== null && prevRate - curRate >= 3)
    notes.push({ tone: "warning", text: `Attendance fell ${(prevRate - curRate).toFixed(1)} points compared with ${word}.` });
  const regRate = attendanceSection.metrics[3].current;
  if (regRate !== null && regRate < 80 && schoolDays.cur > 0)
    notes.push({ tone: "info", text: `Only ${formatMi(regRate, "percent")} of class registers were taken (public holidays also lower this).` });
  if (lowClasses[0] && lowClasses[0].rate < 85)
    notes.push({ tone: "warning", text: `${className(classById.get(lowClasses[0].cid))} had the lowest attendance at ${formatMi(lowClasses[0].rate, "percent")}.` });
  if (serious.cur) notes.push({ tone: "danger", text: `${serious.cur} serious incident${serious.cur === 1 ? " was" : "s were"} recorded.` });
  if (unresolved) notes.push({ tone: "warning", text: `${unresolved} incident${unresolved === 1 ? " is" : "s are"} still not resolved.` });
  if (overdue && overdue > 0) notes.push({ tone: "warning", text: `${formatMi(overdue, "money")} in fees is overdue.` });
  if (collected.cur !== null && collected.prev && collected.cur < collected.prev * 0.75)
    notes.push({ tone: "info", text: `Fees collected are ${Math.round((1 - collected.cur / collected.prev) * 100)}% lower than ${word}.` });
  const waitingApps = pupils.snapshots?.[1].value;
  if (waitingApps) notes.push({ tone: "info", text: `${waitingApps} admission application${waitingApps === 1 ? " is" : "s are"} waiting for a reply.` });
  if (waitingCorrections) notes.push({ tone: "info", text: `${waitingCorrections} result correction request${waitingCorrections === 1 ? " is" : "s are"} waiting for a decision.` });
  // Early in a week everyone is still at zero: only point out quiet teachers once three school days have passed.
  if (quietTeachers.length && schoolDays.cur >= 3) {
    const names = quietTeachers.slice(0, 3).map(personName).join(", ");
    const more = quietTeachers.length > 3 ? ` and ${quietTeachers.length - 3} more` : "";
    notes.push({ tone: "warning", text: `${quietTeachers.length} teacher${quietTeachers.length === 1 ? " has" : "s have"} recorded no work: ${names}${more}.` });
  }
  if (starRows && majorRows && missingSlots.length && (!p.inProgress || schoolDays.cur >= 3)) {
    const list = missingSlots.slice(0, 4).join(", ") + (missingSlots.length > 4 ? ` and ${missingSlots.length - 4} more` : "");
    notes.push({ tone: "warning", text: `Star videos not posted yet: ${list}.` });
  }
  if (noMajors && majorRows) notes.push({ tone: "info", text: `${noMajors} class${noMajors === 1 ? " has" : "es have"} no major subjects chosen, so no star videos are expected from ${noMajors === 1 ? "it" : "them"}.` });
  if (avgDecide.cur !== null && avgDecide.cur > 72)
    notes.push({ tone: "warning", text: `Result correction requests took ${Math.round(avgDecide.cur / 24)} days on average to decide.` });
  if (unassigned.length) notes.push({ tone: "info", text: `${unassigned.length} teacher${unassigned.length === 1 ? " has" : "s have"} no class or subject assigned.` });
  if (!notes.length) notes.push({ tone: "success", text: "Nothing stands out this period." });

  return {
    period: p,
    generatedAt: new Date().toISOString(),
    headline: [
      attendanceSection.metrics[0],
      money.metrics[0],
      { ...pupils.metrics[0], label: "Admission enquiries" },
      { ...welfare.metrics[0], label: "Incidents" },
      { ...teaching.metrics[1], label: "Work handed in" },
      { ...starSection.metrics[1], label: "Star videos posted (of expected)" }
    ],
    notes,
    sections: [pupils, attendanceSection, money, welfare, teaching, starSection, staffSection, headsSection, communication]
  };
}
