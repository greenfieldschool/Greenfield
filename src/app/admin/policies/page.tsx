import { redirect } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { staffRoles } from "@/lib/route-access";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import PrintButton from "@/components/print-button";
import { PolicyDocument } from "@/components/policies/policy-view";
import { LEARN } from "@/lib/learn-guides";
import { isApproved, POLICIES, POLICY_SUGGESTIONS, type PolicyKey } from "@/lib/policies";

// School policies for staff to read: the staff policy, the policy for parents and pupils, and (for admins) the
// changes suggested for the next review. The text lives in src/lib/policies.

type Tab = PolicyKey | "suggestions";

export default async function AdminPoliciesPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const raw = Array.isArray(sp.doc) ? sp.doc[0] : sp.doc;

  // Staff only (the middleware already keeps parents and pupils out of /admin). Fail closed: if we can't tell
  // who this is, show nothing, because the staff policy is not for families.
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = (profile?.role as string | null | undefined) ?? null;
  if (!(staffRoles as readonly string[]).includes(role ?? "")) redirect("/portal/policies");
  const isAdmin = role === "admin" || role === "super_admin";

  const tab: Tab = raw === "families" ? "families" : raw === "suggestions" && isAdmin ? "suggestions" : "staff";
  const tabs = [
    { key: "staff", label: "Staff policy", href: "/admin/policies?doc=staff" },
    { key: "families", label: "Parents and pupils", href: "/admin/policies?doc=families" },
    ...(isAdmin
      ? [{ key: "suggestions", label: "Suggested changes", href: "/admin/policies?doc=suggestions", count: POLICY_SUGGESTIONS.length }]
      : [])
  ];
  const doc = tab === "suggestions" ? null : POLICIES[tab];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="School policies"
        title={doc ? doc.title : "Suggested changes"}
        description={doc ? `For: ${doc.readers}.` : "Ideas for the next review of the policies, for the Proprietress and management to decide."}
        learn={LEARN.policies}
        actions={doc ? <PrintButton label="Print policy" variant="secondary" /> : undefined}
      />
      <LinkTabs tabs={tabs} active={tab} className="print:hidden" />

      {doc && !isApproved(doc) ? (
        <Alert tone="warning" title="This is a draft" className="print:hidden">
          It brings the school&apos;s policy documents together into one, with the differences between them settled. Parents and pupils will see it
          on the portal once the Proprietress approves it.
        </Alert>
      ) : null}

      {doc ? (
        <PolicyDocument doc={doc} />
      ) : (
        <div className="space-y-3">
          {POLICY_SUGGESTIONS.map((s, i) => (
            <Card key={s.title} className="p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold-600" aria-hidden="true" />
                <div className="min-w-0 space-y-2 text-sm">
                  <h2 className="font-semibold text-slate-900">
                    {i + 1}. {s.title}
                  </h2>
                  <p className="text-slate-700">
                    <span className="font-medium text-slate-900">Why: </span>
                    {s.why}
                  </p>
                  <p className="text-slate-700">
                    <span className="font-medium text-slate-900">Suggestion: </span>
                    {s.proposal}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
