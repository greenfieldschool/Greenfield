import { getSupabaseServerClient } from "@/lib/supabase/server";
import PrintButton from "@/components/print-button";
import { FeeDefaultLetter, loadDefaultLetter } from "@/components/fee-default-letter";
import { HELP } from "@/lib/portal-help";
import { PortalNotice, PortalPageHeader } from "../../../_components/portal-ui";

// A parent's default letter. RLS only returns it to the parents who pay that invoice.
export default async function PortalDefaultLetterPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const letter = await loadDefaultLetter(supabase, id);
  if (!letter) {
    return (
      <PortalNotice
        title="Letter"
        heading="Letter not found"
        message="This letter may have been withdrawn by the school. Check Fees & billing for what you owe."
        back={{ href: "/portal/billing", label: "Fees & billing" }}
      />
    );
  }
  return (
    <div className="space-y-6">
      <PortalPageHeader
        className="print:hidden"
        back={{ href: "/portal/billing", label: "Fees & billing" }}
        title="Letter about a missed payment"
        help={HELP.paymentPlans}
        actions={<PrintButton label="Print" variant="secondary" />}
      />
      <FeeDefaultLetter letter={letter} />
    </div>
  );
}
