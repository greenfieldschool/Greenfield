import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { firstOrNull } from "@/lib/relations";
import { formatLagosDate, lagosStartOfDayIso } from "@/lib/lagos-dates";
import DashboardView, { type DashboardData } from "./DashboardView";

type SessionRow = {
  id: string;
  starts_at: string | null;
  ends_at: string | null;
  exam_tests: { name: string } | Array<{ name: string }> | null;
  classes: { level: string; name: string } | Array<{ level: string; name: string }> | null;
};

type PaymentRow = {
  id: string;
  amount: number;
  method: string | null;
  paid_at: string;
  students: { first_name: string; last_name: string; classes: unknown } | null;
};

function lagosToday() {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

export default async function AdminHomePage() {
  const supabase = getSupabaseServerClient();
  const {
    data: { user }
  } = (await supabase?.auth.getUser()) ?? { data: { user: null } };

  if (!user || !supabase) {
    redirect("/admin/login?redirectTo=/admin");
  }

  const { data: profile } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "super_admin" || profile?.role === "admin";
  const today = lagosToday();
  const nowIso = new Date().toISOString();
  const monthStartIso = lagosStartOfDayIso(`${today.slice(0, 7)}-01`) ?? nowIso;

  // Each widget degrades to "—" / empty on its own if its query fails.
  const [students, classes, applications, sessions, attendance, monthPayments, balances, recent] = await Promise.all([
    supabase.from("students").select("id", { count: "exact", head: true }).in("status", ["active", "enrolled"]),
    supabase.from("classes").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("admissions_applications").select("id", { count: "exact", head: true }).eq("status", "submitted"),
    supabase
      .from("exam_test_sessions")
      .select("id, starts_at, ends_at, exam_tests(name), classes(level, name)")
      .eq("active", true)
      .eq("status", "active")
      .order("ends_at", { ascending: true, nullsFirst: false })
      .limit(200),
    supabase.from("student_attendance").select("status").eq("date", today).limit(5000),
    isAdmin
      ? supabase
          .from("finance_payment_transactions")
          .select("amount")
          .eq("status", "posted")
          .eq("direction", "inflow")
          .gte("paid_at", monthStartIso)
          .limit(5000)
      : Promise.resolve({ data: null }),
    isAdmin
      ? supabase.from("finance_guardian_balances").select("outstanding_total").gt("outstanding_total", 0).limit(5000)
      : Promise.resolve({ data: null }),
    isAdmin
      ? supabase
          .from("finance_payment_transactions")
          .select("id, amount, method, paid_at, students(first_name, last_name, classes(level, name))")
          .eq("direction", "inflow")
          .eq("status", "posted")
          .order("paid_at", { ascending: false })
          .limit(6)
      : Promise.resolve({ data: null })
  ]);

  const attendanceRows = (attendance.data ?? []) as Array<{ status: string }>;
  const attendanceToday = attendanceRows.length
    ? {
        present: attendanceRows.filter((r) => r.status === "present").length,
        late: attendanceRows.filter((r) => r.status === "late").length,
        absent: attendanceRows.filter((r) => r.status === "absent").length,
        expected: students.count ?? attendanceRows.length
      }
    : null;

  const now = Date.now();
  const openSessions = ((sessions.data ?? []) as unknown as SessionRow[])
    .filter((s) => (!s.starts_at || new Date(s.starts_at).getTime() <= now) && (!s.ends_at || new Date(s.ends_at).getTime() >= now))
    .map((s) => {
    const cls = firstOrNull(s.classes);
    return {
      id: s.id,
      testName: firstOrNull(s.exam_tests)?.name ?? "Exam",
      className: cls ? `${cls.level} - ${cls.name}` : "All classes",
      endsLabel: s.ends_at ? `Until ${formatLagosDate(s.ends_at)}` : "Open"
    };
    });

  const data: DashboardData = {
    greetingName: profile?.full_name?.split(" ")[0] || (user.email ?? "").split("@")[0],
    isAdmin,
    todayLabel: new Date().toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Africa/Lagos"
    }),
    stats: {
      activeStudents: students.error ? null : (students.count ?? 0),
      classes: classes.error ? null : (classes.count ?? 0),
      pendingApplications: applications.error ? null : (applications.count ?? 0),
      openExamSessions: sessions.error ? null : openSessions.length
    },
    attendanceToday,
    openSessions,
    finance: isAdmin
      ? {
          collectedThisMonth: ((monthPayments.data ?? []) as Array<{ amount: number }>).reduce(
            (acc, p) => acc + Number(p.amount ?? 0),
            0
          ),
          outstanding: ((balances.data ?? []) as Array<{ outstanding_total: number }>).reduce(
            (acc, b) => acc + Number(b.outstanding_total ?? 0),
            0
          ),
          recentPayments: ((recent.data ?? []) as unknown as PaymentRow[]).map((p) => {
            const cls = firstOrNull(p.students?.classes as { level: string; name: string } | null);
            return {
              id: p.id,
              studentName: p.students ? `${p.students.first_name} ${p.students.last_name}` : "Unlinked payment",
              className: cls ? `${cls.level} - ${cls.name}` : "—",
              amount: Number(p.amount ?? 0),
              method: p.method ?? "—",
              whenLabel: formatLagosDate(p.paid_at)
            };
          })
        }
      : null
  };

  return <DashboardView data={data} />;
}
