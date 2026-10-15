import PortalShell from "@/app/portal/PortalShell";
import PortalDashboardView from "@/app/portal/PortalDashboardView";

export default function ParentPreview() {
  return (
    <PortalShell role="parent" displayName="Mrs Bisi Adeyemi" displayEmail="bisi.adeyemi@example.com">
      <PortalDashboardView
        data={{
          kind: "parent",
          name: "Bisi Adeyemi",
          children: [
            { id: "1", name: "Tobi Adeyemi", classLabel: "Primary · Preparatory", admissionNumber: "GRE/2026/001" },
            { id: "2", name: "Tolu Adeyemi", classLabel: "Secondary · JSS1", admissionNumber: "GRE/2024/112" }
          ],
          billing: { outstanding: 404250, unpaidInvoices: 1 }
        }}
      />
    </PortalShell>
  );
}
