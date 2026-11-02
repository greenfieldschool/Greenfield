import { Award as AwardIcon } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { awardsFor } from "@/lib/certificates";
import { toLagosDateInput } from "@/lib/lagos-dates";
import Certificate from "@/components/certificate";
import PrintButton from "@/components/print-button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PortalPageHeader, PortalNotice } from "../../_components/portal-ui";
import { loadPortalReport } from "../_load";
import { FeeHoldNotice, ReportPickers, termLabel } from "../_parts";

// The pupil's certificates for a published term, one per A4 landscape page. Held back with the report card
// while fees are unpaid.
export default async function PortalCertificatesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const data = await loadPortalReport(supabase, (await searchParams) ?? {});
  if (!data) return null;
  if (data.kind === "notice") return <PortalNotice title="Certificates" message={data.message} />;

  if (data.kind === "empty") {
    return (
      <div className="space-y-6">
        <PortalPageHeader title="Certificates" description="Awards from the term's report card." />
        <Card>
          <EmptyState icon={AwardIcon} title="Nothing to show yet" description={data.message} />
        </Card>
      </div>
    );
  }

  const { role, student, report, mine, latest, hold } = data;
  const released = hold.status === "clear";
  // Positions need the whole class (service key); without it, only welfare awards are certain.
  const awards = released ? awardsFor(report, mine).filter((a) => data.canRank || a.kind === "welfare") : [];
  const reportHref = `/portal/academics?${new URLSearchParams(role === "parent" ? { pub: latest.id, student_id: student.id } : { pub: latest.id })}`;

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PortalPageHeader
          eyebrow={termLabel(latest) || undefined}
          title="Certificates"
          description={role === "parent" ? `${student.first_name} ${student.last_name} · ${report.cls.name}` : report.cls.name}
          actions={awards.length ? <PrintButton label={awards.length > 1 ? `Print ${awards.length} certificates` : "Print certificate"} variant="secondary" /> : undefined}
        />
        <a href={reportHref} className="mt-2 inline-block text-sm font-semibold text-brand-green-700 hover:underline">
          ← Back to the report card
        </a>
      </div>

      <ReportPickers data={data} path="/portal/academics/certificates" />

      {!released ? (
        <FeeHoldNotice data={data} what="certificates" />
      ) : awards.length ? (
        <div className="space-y-6 print:space-y-0">
          {awards.map((a) => (
            <Certificate key={a.key} report={report} student={mine} award={a} issuedOn={toLagosDateInput(latest.published_at)} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            icon={AwardIcon}
            title="No certificates this term"
            description="Certificates go to the top three in class, the best in each subject, and Gold, Silver or Bronze for welfare."
          />
        </Card>
      )}
    </div>
  );
}
