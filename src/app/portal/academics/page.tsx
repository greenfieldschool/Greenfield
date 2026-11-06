import { Award as AwardIcon, BookOpen } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { awardsFor } from "@/lib/certificates";
import ReportCard from "@/components/report-card";
import PrintButton from "@/components/print-button";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PortalPageHeader, PortalNotice } from "../_components/portal-ui";
import { loadPortalReport, termParams } from "./_load";
import { FeeHoldNotice, ReportPickers, termLabel } from "./_parts";
import { HELP } from "@/lib/portal-help";

function EmptyAcademics({ message }: { message: string }) {
  return (
    <div className="space-y-6">
      <PortalPageHeader
        help={HELP.reportCards} title="Report card" description="Term results published by the school." />
      <Card>
        <EmptyState icon={BookOpen} title="Nothing to show yet" description={message} />
      </Card>
    </div>
  );
}

export default async function PortalAcademicsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const data = await loadPortalReport(supabase, (await searchParams) ?? {});
  if (!data) return null;
  if (data.kind === "notice") return <PortalNotice title="Report card" message={data.message} />;
  if (data.kind === "empty") return <EmptyAcademics message={data.message} />;

  const { role, student, report, mine, latest, hold } = data;
  const released = hold.status === "clear";
  const awards = released ? awardsFor(report, mine).filter((a) => data.canRank || a.kind === "welfare") : [];
  const certParams = termParams(latest, role === "parent" ? student.id : null);

  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <PortalPageHeader
          help={HELP.reportCards}
          eyebrow={termLabel(latest) || undefined}
          title="Report card"
          description={role === "parent" ? `${student.first_name} ${student.last_name} · ${report.cls.name}` : report.cls.name}
          actions={released ? <PrintButton label="Print / save as PDF" variant="secondary" /> : undefined}
        />
      </div>

      <ReportPickers data={data} path="/portal/academics" />

      {!released ? (
        <FeeHoldNotice data={data} what="report card" />
      ) : (
        <>
          {awards.length ? (
            <Card className="print:hidden">
              <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-gold-50 text-brand-gold-700">
                    <AwardIcon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {awards.length === 1 ? "A certificate" : `${awards.length} certificates`} this term
                    </div>
                    <div className="text-sm text-slate-600">{awards.map((a) => a.title).join(" · ")}</div>
                  </div>
                </div>
                <ButtonLink href={`/portal/academics/certificates?${certParams.toString()}`} variant="secondary" size="sm">
                  View certificates
                </ButtonLink>
              </div>
            </Card>
          ) : null}
          <ReportCard report={report} student={mine} showPositions={data.canRank} />
        </>
      )}
    </div>
  );
}
