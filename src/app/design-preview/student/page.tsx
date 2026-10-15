import PortalShell from "@/app/portal/PortalShell";
import PortalDashboardView from "@/app/portal/PortalDashboardView";

export default function StudentPreview() {
  return (
    <PortalShell role="student" displayName="Tobi Adeyemi" displayEmail="student@greenfieldschool.ng">
      <PortalDashboardView
        data={{
          kind: "student",
          name: "Tobi Adeyemi",
          classLabel: "Primary · Preparatory",
          admissionNumber: "GRE/2026/001",
          openExams: [
            { id: "1", name: "Basic Science — First Term", durationLabel: "60 minutes", closesLabel: "17 Oct 2026" },
            { id: "2", name: "Numeracy — First Term", durationLabel: "45 minutes", closesLabel: "17 Oct 2026" }
          ],
          recentResults: [
            { id: "a", name: "English Language — Mid-term", score: "34 / 40 marks", percent: 85 },
            { id: "b", name: "Social Studies — Mid-term", score: "23 / 40 marks", percent: 57.5 }
          ],
          termResultsPublished: true,
          attendance: { present: 19, late: 2, absent: 1 }
        }}
      />
    </PortalShell>
  );
}
