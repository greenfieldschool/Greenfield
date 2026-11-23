import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import PrintButton from "@/components/print-button";
import { FeeDefaultLetter, loadDefaultLetter } from "@/components/fee-default-letter";
import { LEARN } from "@/lib/learn-guides";

// Printable default letter for a missed plan payment (admins; the finance area is admin-only).
export default async function DefaultLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const letter = await loadDefaultLetter(supabase, id);
  return (
    <div className="space-y-6">
      <PageHeader
        className="print:hidden"
        learn={LEARN.paymentPlans}
        back={{ href: "/admin/finance/payment-plans", label: "Back to payment plans" }}
        eyebrow="Finance"
        title="Default letter"
        description="The parent can also read this letter on the portal, under Fees & billing."
        actions={letter ? <PrintButton label="Print letter" /> : undefined}
      />
      {letter ? (
        <FeeDefaultLetter letter={letter} />
      ) : (
        <Alert tone="warning" title="Letter not found">
          This default fee may have been removed, or the link is wrong.
        </Alert>
      )}
    </div>
  );
}
