import { ScrollText } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import PrintButton from "@/components/print-button";
import { PolicyDocument } from "@/components/policies/policy-view";
import { forReader, isApproved, POLICIES } from "@/lib/policies";
import { HELP } from "@/lib/portal-help";
import { PortalNotice, PortalPageHeader, portalMessages } from "../_components/portal-ui";

// The school policy for parents and pupils. Pupils don't see the parents-only parts (fees, admission, PTA).
// Nothing shows until the Proprietress has approved the current version (src/lib/policies/families.ts).
export default async function PortalPoliciesPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: identityRows } = await supabase.rpc("portal_identity");
  const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : null) as { role?: string | null } | null;
  const role = identity?.role ?? null;
  if (role !== "parent" && role !== "student") return <PortalNotice title="School policy" message={portalMessages.notPortal} />;

  const doc = POLICIES.families;
  if (!isApproved(doc)) {
    return (
      <PortalNotice
        title="School policy"
        heading="The school policy is being updated"
        message="The new version will appear here once it is approved. Until then, ask the school office for a printed copy."
        icon={ScrollText}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title="School policy"
        description={role === "student" ? "The rules and routines every learner follows." : "School times, rules, fees, payment plans and rewards."}
        help={HELP.policies}
        actions={<PrintButton label="Print" variant="secondary" />}
      />
      <PolicyDocument doc={forReader(doc, role)} />
    </div>
  );
}
