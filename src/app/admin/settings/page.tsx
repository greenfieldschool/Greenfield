import { Settings } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Admin" title="Settings" />
      <Card>
        <EmptyState icon={Settings} title="Nothing to configure yet" description="Settings will live here." />
      </Card>
    </div>
  );
}
