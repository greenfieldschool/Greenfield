import AdminShell from "@/app/admin/AdminShell";
import DashboardView from "@/app/admin/DashboardView";

export default function AdminPreview() {
  return (
    <AdminShell userEmail="admin@greenfieldschool.ng" role="admin">
      <DashboardView
        data={{
          greetingName: "Admin",
          isAdmin: true,
          todayLabel: "Thursday, 15 October 2026",
          stats: { activeStudents: 412, classes: 18, pendingApplications: 7, openExamSessions: 3 },
          attendanceToday: { present: 361, late: 14, absent: 22, expected: 412 },
          openSessions: [
            { id: "1", testName: "Basic Science — Year 5", className: "primary - Year 5", endsLabel: "Until 17 Oct 2026" },
            { id: "2", testName: "English Language — SS3", className: "secondary - SS3", endsLabel: "Until 16 Oct 2026" },
            { id: "3", testName: "Numeracy — Reception", className: "creche - Reception", endsLabel: "Open" }
          ],
          finance: {
            collectedThisMonth: 4825000,
            outstanding: 12940500,
            recentPayments: [
              { id: "a", studentName: "Tobi Adeyemi", className: "primary - Preparatory", amount: 404250, method: "transfer", whenLabel: "14 Oct 2026" },
              { id: "b", studentName: "Chiamaka Obi", className: "secondary - JSS2", amount: 150000, method: "pos", whenLabel: "13 Oct 2026" },
              { id: "c", studentName: "Ada Okafor", className: "primary - Year 3", amount: 53500, method: "cash", whenLabel: "12 Oct 2026" }
            ]
          }
        }}
      />
    </AdminShell>
  );
}
