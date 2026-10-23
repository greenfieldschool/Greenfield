import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { welfareSources, type WelfareSource } from "@/lib/welfare";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { LinkTabs } from "@/components/ui/tabs";
import { buttonClasses } from "@/components/ui/button";

const PATH = "/admin/welfare/criteria";
const levels = ["creche", "primary", "secondary"] as const;

type CriterionRow = {
  id: string;
  level: string;
  name: string;
  description: string | null;
  source: WelfareSource;
  max_points: number;
  position: number;
  active: boolean;
};

type RulesRow = { discipline_severity_penalty: number; gold_min: number; silver_min: number; bronze_min: number };

function back(level: string, message: string, type: "success" | "error" = "success"): never {
  revalidatePath(PATH);
  revalidatePath("/admin/welfare/scores");
  revalidatePath("/admin/academics/reports");
  revalidatePath("/portal/academics");
  redirect(`${PATH}?level=${level}&toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

function readCriterion(formData: FormData) {
  const level = String(formData.get("level") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim().replace(/\s+/g, " ");
  const description = String(formData.get("description") ?? "").trim();
  const source = String(formData.get("source") ?? "rating").trim() as WelfareSource;
  const maxPoints = Number(String(formData.get("max_points") ?? "").trim());
  const position = Number(String(formData.get("position") ?? "0").trim() || "0");
  if (!levels.includes(level as (typeof levels)[number])) back("primary", "Choose a level", "error");
  if (!name) back(level, "Enter a name for the criterion", "error");
  if (!welfareSources.some((s) => s.value === source)) back(level, "Choose how the criterion is scored", "error");
  if (!Number.isFinite(maxPoints) || maxPoints <= 0 || maxPoints > 100) back(level, "Points must be between 0 and 100", "error");
  return { level, name, description: description || null, source, max_points: maxPoints, position: Number.isFinite(position) ? position : 0 };
}

async function addCriterion(formData: FormData) {
  "use server";
  const values = readCriterion(formData);
  const supabase = getSupabaseServerClient();
  if (!supabase) back(values.level, "Database is not configured", "error");
  const { error } = await supabase.from("welfare_criteria").insert(values);
  if (error) back(values.level, error.code === "23505" ? "A criterion with that name already exists for this level" : error.message, "error");
  back(values.level, "Criterion added");
}

async function updateCriterion(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const values = readCriterion(formData);
  const active = formData.get("active") === "on";
  const supabase = getSupabaseServerClient();
  if (!supabase || !id) back(values.level, "Database is not configured", "error");
  const { error } = await supabase
    .from("welfare_criteria")
    .update({ ...values, active, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) back(values.level, error.code === "23505" ? "A criterion with that name already exists for this level" : error.message, "error");
  back(values.level, "Criterion saved");
}

async function deleteCriterion(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "").trim();
  const level = String(formData.get("level") ?? "primary").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase || !id) back(level, "Database is not configured", "error");
  const { count } = await supabase.from("welfare_ratings").select("id", { count: "exact", head: true }).eq("criterion_id", id);
  if ((count ?? 0) > 0) {
    back(level, `Pupils already have ${count} rating(s) for this criterion. Untick "Active" to stop using it instead, so past report cards stay the same.`, "error");
  }
  const { error } = await supabase.from("welfare_criteria").delete().eq("id", id);
  if (error) back(level, error.message, "error");
  back(level, "Criterion deleted");
}

async function copyFromLevel(formData: FormData) {
  "use server";
  const level = String(formData.get("level") ?? "").trim();
  const from = String(formData.get("from_level") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase || !level || !from || level === from) back(level || "primary", "Choose another level to copy from", "error");
  const { data } = await supabase
    .from("welfare_criteria")
    .select("name, description, source, max_points, position, active")
    .eq("level", from);
  const rows = ((data ?? []) as Array<Omit<CriterionRow, "id" | "level">>).map((r) => ({ ...r, level }));
  if (!rows.length) back(level, "That level has no criteria", "error");
  const { error } = await supabase.from("welfare_criteria").upsert(rows, { onConflict: "level,name", ignoreDuplicates: true });
  if (error) back(level, error.message, "error");
  back(level, `Copied criteria from ${from} (existing names were kept as they are)`);
}

async function saveRules(formData: FormData) {
  "use server";
  const level = String(formData.get("level") ?? "").trim();
  const num = (k: string) => Number(String(formData.get(k) ?? "").trim());
  const values = {
    level,
    discipline_severity_penalty: num("discipline_severity_penalty"),
    gold_min: num("gold_min"),
    silver_min: num("silver_min"),
    bronze_min: num("bronze_min"),
    active: true
  };
  if (Object.values(values).some((v) => typeof v === "number" && (!Number.isFinite(v) || v < 0))) back(level, "Enter valid numbers", "error");
  const supabase = getSupabaseServerClient();
  if (!supabase) back(level, "Database is not configured", "error");
  const { error } = await supabase.from("welfare_scoring_rules").upsert(values, { onConflict: "level" });
  if (error) back(level, error.message, "error");
  back(level, "Conduct penalty and badges saved");
}

export default async function WelfareCriteriaPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;
  const sp = (await searchParams) ?? {};
  const levelRaw = typeof sp.level === "string" ? sp.level : "primary";
  const level = levels.includes(levelRaw as (typeof levels)[number]) ? levelRaw : "primary";

  const [{ data, error }, { data: rulesData }] = await Promise.all([
    supabase
      .from("welfare_criteria")
      .select("id, level, name, description, source, max_points, position, active")
      .eq("level", level)
      .order("position", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("welfare_scoring_rules")
      .select("discipline_severity_penalty, gold_min, silver_min, bronze_min")
      .eq("level", level)
      .maybeSingle()
  ]);
  const rows = (data ?? []) as CriterionRow[];
  const rules = (rulesData as RulesRow | null) ?? { discipline_severity_penalty: 1, gold_min: 85, silver_min: 70, bronze_min: 50 };
  const activeTotal = rows.filter((r) => r.active).reduce((a, r) => a + Number(r.max_points), 0);

  const input =
    "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15";

  const fields = (r?: CriterionRow) => (
    <>
      <input type="hidden" name="level" value={level} />
      <input className={input} name="name" defaultValue={r?.name ?? ""} placeholder="e.g. Neatness" aria-label="Name" required />
      <select className={input} name="source" defaultValue={r?.source ?? "rating"} aria-label="How it is scored">
        {welfareSources.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>
      <input className={`${input} tabular-nums`} name="max_points" type="number" step="0.5" min="0.5" max="100" defaultValue={r ? Number(r.max_points) : 5} aria-label="Points" required />
      <input className={`${input} tabular-nums`} name="position" type="number" step="1" defaultValue={r?.position ?? rows.length + 1} aria-label="Order" />
      <input className={`${input} sm:col-span-4`} name="description" defaultValue={r?.description ?? ""} placeholder="What the teacher looks for (shown on the score sheet)" aria-label="Description" />
    </>
  );

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Welfare"
        title="Welfare criteria"
        description="What welfare is scored on for each level, and how many of the 100 points each criterion is worth. Teacher-rated criteria are rated 1–5 on the welfare score sheet; the others are worked out from the school's records."
      />

      <LinkTabs tabs={levels.map((l) => ({ key: l, label: l.charAt(0).toUpperCase() + l.slice(1), href: `${PATH}?level=${l}` }))} active={level} />

      {error ? <Alert tone="danger">Welfare criteria are not set up yet. Run docs/migrations/20261022_term_reports.sql in Supabase. ({error.message})</Alert> : null}

      <Card>
        <CardHeader
          title="Criteria"
          description="Points of the active criteria should add up to 100. If they don't, welfare is still shown out of 100 (scaled)."
          action={<Badge tone={activeTotal === 100 ? "green" : "gold"}>Total {activeTotal}</Badge>}
        />
        <ul className="divide-y divide-slate-100">
          {rows.map((r) => (
            <li key={r.id} className="px-5 py-4 sm:px-6">
              <form action={updateCriterion} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_13rem_6rem_5rem]">
                <input type="hidden" name="id" value={r.id} />
                {fields(r)}
                <div className="flex flex-wrap items-center justify-between gap-3 sm:col-span-4">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" name="active" defaultChecked={r.active} className="h-4 w-4" />
                    Active
                  </label>
                  <div className="flex items-center gap-2">
                    <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                      <span className="inline-flex items-center gap-1.5">
                        <Save className="h-4 w-4" aria-hidden="true" />
                        Save
                      </span>
                    </SubmitButton>
                  </div>
                </div>
              </form>
              <form action={deleteCriterion} className="mt-1 flex justify-end">
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="level" value={level} />
                <ConfirmSubmitButton
                  confirmMessage={`Delete "${r.name}"?`}
                  className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </ConfirmSubmitButton>
              </form>
            </li>
          ))}
          {!rows.length ? <li className="px-5 py-6 text-sm text-slate-600 sm:px-6">No criteria for this level yet.</li> : null}
        </ul>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Add a criterion" />
          <CardBody>
            <form action={addCriterion} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_13rem_6rem_5rem]">
              {fields()}
              <div className="flex justify-end sm:col-span-4">
                <SubmitButton variant="primary" size="sm" pendingText="Adding…">
                  <span className="inline-flex items-center gap-1.5">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Add
                  </span>
                </SubmitButton>
              </div>
            </form>
            <ul className="mt-4 space-y-1 text-xs text-slate-600">
              {welfareSources.map((s) => (
                <li key={s.value}>
                  <span className="font-semibold">{s.label}:</span> {s.help}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Conduct penalty & badges" />
            <CardBody>
              <form action={saveRules} className="grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="level" value={level} />
                <label className="text-sm">
                  <span className="gf-label">Points off per severity point</span>
                  <input className={input} name="discipline_severity_penalty" type="number" step="0.5" min="0" defaultValue={Number(rules.discipline_severity_penalty)} />
                </label>
                <label className="text-sm">
                  <span className="gf-label">Gold badge from (%)</span>
                  <input className={input} name="gold_min" type="number" step="1" min="0" max="100" defaultValue={Number(rules.gold_min)} />
                </label>
                <label className="text-sm">
                  <span className="gf-label">Silver from (%)</span>
                  <input className={input} name="silver_min" type="number" step="1" min="0" max="100" defaultValue={Number(rules.silver_min)} />
                </label>
                <label className="text-sm">
                  <span className="gf-label">Bronze from (%)</span>
                  <input className={input} name="bronze_min" type="number" step="1" min="0" max="100" defaultValue={Number(rules.bronze_min)} />
                </label>
                <p className="text-xs text-slate-600 sm:col-span-2">
                  Example: a discipline record of severity 3 with 1 point per severity takes 3 points off the Conduct criterion.
                  Health incidents never reduce the welfare score.
                </p>
                <div className="flex justify-end sm:col-span-2">
                  <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                    Save
                  </SubmitButton>
                </div>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Copy from another level" description="Adds that level's criteria here. Criteria with the same name are left as they are." />
            <CardBody>
              <form action={copyFromLevel} className="flex flex-col gap-3 sm:flex-row">
                <input type="hidden" name="level" value={level} />
                <select name="from_level" className="gf-select" defaultValue="" required>
                  <option value="">Choose level</option>
                  {levels
                    .filter((l) => l !== level)
                    .map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                </select>
                <SubmitButton pendingText="Copying…" className={buttonClasses({ variant: "secondary", className: "shrink-0" })}>
                  <span className="inline-flex items-center gap-1.5">
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copy
                  </span>
                </SubmitButton>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}
