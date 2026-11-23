import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PolicyExcerpt } from "@/components/policies/policy-view";
import { LEARN } from "@/lib/learn-guides";
import { LADDER_LABELS, disciplineError, type DisciplineRule, type Ladder } from "@/lib/discipline";
import { saveRuleAction, setRuleActiveAction } from "../actions";

// The rules staff pick from when recording a discipline case. Admins only (route-access + RLS). Rules are never
// deleted: retiring one hides it from the form, and its past cases still count on the ladder.

function RuleFields({ rule }: { rule?: DisciplineRule }) {
  const id = rule?.id ?? "new";
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {rule ? <input type="hidden" name="id" value={rule.id} /> : null}
      <div>
        <label className="gf-label" htmlFor={`name-${id}`}>
          Rule
        </label>
        <input id={`name-${id}`} name="name" className="gf-input" required minLength={3} maxLength={80} defaultValue={rule?.name} />
      </div>
      <div>
        <label className="gf-label" htmlFor={`ladder-${id}`}>
          How the ladder applies
        </label>
        <select id={`ladder-${id}`} name="ladder" className="gf-select" defaultValue={rule?.ladder ?? "steps"}>
          {(Object.keys(LADDER_LABELS) as Ladder[]).map((k) => (
            <option key={k} value={k}>
              {LADDER_LABELS[k]}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="gf-label" htmlFor={`desc-${id}`}>
          What it covers <span className="font-normal text-slate-500">(shown to staff when recording)</span>
        </label>
        <input id={`desc-${id}`} name="description" className="gf-input" maxLength={300} defaultValue={rule?.description ?? ""} />
      </div>
      <div>
        <label className="gf-label" htmlFor={`pos-${id}`}>
          Order in the list
        </label>
        <input id={`pos-${id}`} name="position" type="number" className="gf-input" defaultValue={rule?.position ?? 100} />
      </div>
    </div>
  );
}

export default async function DisciplineRulesPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") redirect("/admin/welfare/discipline");

  const { data, error } = await supabase.from("discipline_rules").select("id, name, description, ladder, active, position").order("position").order("name");
  const rules = (data ?? []) as DisciplineRule[];

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        back={{ href: "/admin/welfare/discipline", label: "Discipline" }}
        learn={LEARN.disciplineLadder}
        eyebrow="Welfare"
        title="Discipline rules"
        description="The rules staff choose from when recording a case. The ladder counts each rule separately for each pupil."
      />
      <PolicyExcerpt policy="families" section="school-rules" />
      {error ? <Alert tone="warning">{disciplineError(error.message)}</Alert> : null}

      <Card>
        <CardHeader title="Rules in use and retired" description="Retire a rule to take it off the form. Its past cases still count." />
        <ul className="divide-y divide-slate-100">
          {rules.map((r) => (
            <li key={r.id} className="px-5 py-3 sm:px-6">
              <details>
                <summary className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-2 text-sm">
                  <span className={`font-semibold ${r.active ? "text-slate-900" : "text-slate-400 line-through"}`}>{r.name}</span>
                  {r.ladder !== "steps" ? <Badge tone="gold">{LADDER_LABELS[r.ladder]}</Badge> : null}
                  {!r.active ? <Badge tone="slate">Retired</Badge> : null}
                  <span className="ml-auto text-xs font-semibold text-brand-green-700">Change</span>
                </summary>
                <div className="space-y-4 pt-3">
                  <form action={saveRuleAction} className="space-y-4">
                    <RuleFields rule={r} />
                    <SubmitButton variant="primary" size="sm" pendingText="Saving…">
                      Save rule
                    </SubmitButton>
                  </form>
                  <form action={setRuleActiveAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="active" value={r.active ? "no" : "yes"} />
                    <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                      {r.active ? "Retire this rule" : "Put back in use"}
                    </SubmitButton>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Add a rule" description="Only add rules the school policy has. If the policy needs a new rule, the Proprietress approves it first." />
        <form action={saveRuleAction} className="space-y-4 px-5 pb-5 sm:px-6">
          <RuleFields />
          <SubmitButton variant="primary" pendingText="Adding…">
            Add rule
          </SubmitButton>
        </form>
      </Card>
    </div>
  );
}
