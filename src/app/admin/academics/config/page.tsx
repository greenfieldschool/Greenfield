import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { Award, Plus, Scale } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type WeightRow = {
  id: string;
  level: string;
  assessment_type: string;
  weight: number;
  active: boolean;
};

type ScaleRow = {
  id: string;
  level: string;
  grade: string;
  min_score: number;
  max_score: number;
  active: boolean;
};

const levels = ["creche", "primary", "secondary"] as const;

function configBack(message: string, type: "success" | "error" = "success"): never {
  redirect(`/admin/academics/config?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

// Row layouts for the inline editors (each row is its own form, so a CSS grid stands in for a table).
const weightGrid = "grid grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_auto] items-center gap-3 px-5 py-2.5 sm:px-6";
const scaleGrid = "grid grid-cols-[4rem_minmax(0,1fr)_minmax(0,1fr)_4.5rem_auto] items-center gap-3 px-5 py-2.5 sm:px-6";
const compactInput =
  "h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15";

export default async function AdminAcademicsConfigPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: weights }, { data: scales }] = await Promise.all([
    supabase
      .from("assessment_weights")
      .select("id, level, assessment_type, weight, active")
      .order("level")
      .order("assessment_type"),
    supabase
      .from("grading_scales")
      .select("id, level, grade, min_score, max_score, active")
      .order("level")
      .order("min_score", { ascending: false })
  ]);

  const weightRows = (weights ?? []) as WeightRow[];
  const scaleRows = (scales ?? []) as ScaleRow[];

  async function upsertWeight(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const level = String(formData.get("level") ?? "").trim();
    const assessmentType = String(formData.get("assessment_type") ?? "").trim();
    const weight = Number(String(formData.get("weight") ?? "0").trim() || "0");
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!level || !assessmentType) configBack("Enter an assessment type", "error");
    if (!Number.isFinite(weight) || weight < 0) configBack("Weight must be 0 or more", "error");

    const supabase = getSupabaseServerClient();
    if (!supabase) configBack("Database is not configured", "error");

    const { error } = await supabase
      .from("assessment_weights")
      .upsert(
        {
          id: id.length ? id : undefined,
          level,
          assessment_type: assessmentType,
          weight,
          active
        },
        { onConflict: "level,assessment_type" }
      );

    revalidatePath("/admin/academics/config");
    if (error) configBack(error.message, "error");
    redirect(`/admin/academics/config?toast=${encodeURIComponent("Weight saved")}&toast_type=success`);
  }

  async function upsertScale(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const level = String(formData.get("level") ?? "").trim();
    const grade = String(formData.get("grade") ?? "").trim();
    const minScore = Number(String(formData.get("min_score") ?? "0").trim() || "0");
    const maxScore = Number(String(formData.get("max_score") ?? "0").trim() || "0");
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!level || !grade) configBack("Enter a grade", "error");
    if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) configBack("Enter valid min and max scores", "error");

    const supabase = getSupabaseServerClient();
    if (!supabase) configBack("Database is not configured", "error");

    const { error } = await supabase
      .from("grading_scales")
      .upsert(
        {
          id: id.length ? id : undefined,
          level,
          grade,
          min_score: minScore,
          max_score: maxScore,
          active
        },
        { onConflict: "level,grade" }
      );

    revalidatePath("/admin/academics/config");
    if (error) configBack(error.message, "error");
    redirect(`/admin/academics/config?toast=${encodeURIComponent("Grading scale saved")}&toast_type=success`);
  }

  function sumWeights(level: string) {
    return weightRows
      .filter((w) => w.level === level && w.active)
      .reduce((acc, w) => acc + Number(w.weight ?? 0), 0);
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Academics"
        title="Configuration"
        description="Configure assessment weights and grading scales per level. Changes affect computed results immediately."
        actions={
          <>
            <a href="#weights" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <Scale className="h-4 w-4" aria-hidden="true" />
              Weights
            </a>
            <a href="#grading" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              <Award className="h-4 w-4" aria-hidden="true" />
              Grading scales
            </a>
          </>
        }
      />

      {/* Assessment weights */}
      <section id="weights" className="scroll-mt-24 space-y-4" aria-labelledby="weights-heading">
        <div>
          <h2 id="weights-heading" className="text-lg font-semibold text-slate-900">
            Assessment weights
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">For each level, active weights should add up to 100.</p>
        </div>

        <div className="grid gap-6 2xl:grid-cols-3">
          {levels.map((lvl) => {
            const rows = weightRows.filter((w) => w.level === lvl);
            const total = sumWeights(lvl);
            return (
              <Card key={lvl}>
                <CardHeader
                  title={<span className="capitalize">{lvl}</span>}
                  description={`${rows.length} weight${rows.length === 1 ? "" : "s"}`}
                  action={<Badge tone={total === 100 ? "green" : "gold"}>Active total: {total}%</Badge>}
                />
                <div className="gf-table-wrap">
                  <div className="min-w-[420px]">
                    <div className={cn(weightGrid, "border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500")}>
                      <div>Type</div>
                      <div>Weight %</div>
                      <div>Active</div>
                      <div className="sr-only">Save</div>
                    </div>
                    {rows.length ? (
                      rows.map((w) => (
                        <form key={w.id} action={upsertWeight} className={cn(weightGrid, "border-b border-slate-100")}>
                          <input type="hidden" name="id" value={w.id} />
                          <input type="hidden" name="level" value={w.level} />
                          <input
                            className={compactInput}
                            name="assessment_type"
                            defaultValue={w.assessment_type}
                            aria-label="Assessment type"
                            required
                          />
                          <input
                            className={cn(compactInput, "tabular-nums")}
                            name="weight"
                            type="number"
                            step="0.01"
                            defaultValue={String(w.weight)}
                            aria-label={`Weight for ${w.assessment_type}`}
                            required
                          />
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                            <input className="gf-checkbox" name="active" type="checkbox" defaultChecked={w.active} />
                            Active
                          </label>
                          <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                            Save
                          </SubmitButton>
                        </form>
                      ))
                    ) : (
                      <p className="px-5 py-6 text-center text-sm text-slate-500 sm:px-6">
                        No weights configured for this level yet.
                      </p>
                    )}
                    <form action={upsertWeight} className={cn(weightGrid, "rounded-b-2xl bg-slate-50/60")}>
                      <input type="hidden" name="id" value="" />
                      <input type="hidden" name="level" value={lvl} />
                      <input className={compactInput} name="assessment_type" placeholder="weekly_test" aria-label="New assessment type" required />
                      <input
                        className={cn(compactInput, "tabular-nums")}
                        name="weight"
                        type="number"
                        step="0.01"
                        placeholder="20"
                        aria-label="New weight"
                        required
                      />
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                        <input className="gf-checkbox" name="active" type="checkbox" defaultChecked />
                        Active
                      </label>
                      <SubmitButton variant="primary" size="sm" pendingText="Adding…">
                        <span className="inline-flex items-center gap-1">
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Add
                        </span>
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Grading scales */}
      <section id="grading" className="scroll-mt-24 space-y-4" aria-labelledby="grading-heading">
        <div>
          <h2 id="grading-heading" className="text-lg font-semibold text-slate-900">
            Grading scales
          </h2>
          <p className="mt-0.5 text-sm text-slate-500">Configure grade bands per level (e.g., A=70-100).</p>
        </div>

        <div className="grid gap-6 2xl:grid-cols-3">
          {levels.map((lvl) => {
            const rows = scaleRows.filter((sc) => sc.level === lvl);
            return (
              <Card key={lvl}>
                <CardHeader
                  title={<span className="capitalize">{lvl}</span>}
                  description={`${rows.length} grade band${rows.length === 1 ? "" : "s"}`}
                />
                <div className="gf-table-wrap">
                  <div className="min-w-[420px]">
                    <div className={cn(scaleGrid, "border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wide text-slate-500")}>
                      <div>Grade</div>
                      <div>Min</div>
                      <div>Max</div>
                      <div>Active</div>
                      <div className="sr-only">Save</div>
                    </div>
                    {rows.length ? (
                      rows.map((sc) => (
                        <form key={sc.id} action={upsertScale} className={cn(scaleGrid, "border-b border-slate-100")}>
                          <input type="hidden" name="id" value={sc.id} />
                          <input type="hidden" name="level" value={sc.level} />
                          <input className={cn(compactInput, "font-semibold")} name="grade" defaultValue={sc.grade} aria-label="Grade" required />
                          <input
                            className={cn(compactInput, "tabular-nums")}
                            name="min_score"
                            type="number"
                            step="0.01"
                            defaultValue={String(sc.min_score)}
                            aria-label={`Minimum score for ${sc.grade}`}
                            required
                          />
                          <input
                            className={cn(compactInput, "tabular-nums")}
                            name="max_score"
                            type="number"
                            step="0.01"
                            defaultValue={String(sc.max_score)}
                            aria-label={`Maximum score for ${sc.grade}`}
                            required
                          />
                          <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                            <input className="gf-checkbox" name="active" type="checkbox" defaultChecked={sc.active} />
                            <span className="sr-only sm:not-sr-only">Active</span>
                          </label>
                          <SubmitButton variant="secondary" size="sm" pendingText="Saving…">
                            Save
                          </SubmitButton>
                        </form>
                      ))
                    ) : (
                      <p className="px-5 py-6 text-center text-sm text-slate-500 sm:px-6">
                        No grading scale configured for this level yet.
                      </p>
                    )}
                    <form action={upsertScale} className={cn(scaleGrid, "rounded-b-2xl bg-slate-50/60")}>
                      <input type="hidden" name="id" value="" />
                      <input type="hidden" name="level" value={lvl} />
                      <input className={compactInput} name="grade" placeholder="A" aria-label="New grade" required />
                      <input
                        className={cn(compactInput, "tabular-nums")}
                        name="min_score"
                        type="number"
                        step="0.01"
                        placeholder="70"
                        aria-label="New minimum score"
                        required
                      />
                      <input
                        className={cn(compactInput, "tabular-nums")}
                        name="max_score"
                        type="number"
                        step="0.01"
                        placeholder="100"
                        aria-label="New maximum score"
                        required
                      />
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-700">
                        <input className="gf-checkbox" name="active" type="checkbox" defaultChecked />
                        <span className="sr-only sm:not-sr-only">Active</span>
                      </label>
                      <SubmitButton variant="primary" size="sm" pendingText="Adding…" showSpinner={false}>
                        <span className="inline-flex items-center gap-1">
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Add
                        </span>
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
