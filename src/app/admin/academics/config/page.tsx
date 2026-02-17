import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

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

    if (!level || !assessmentType) return;
    if (!Number.isFinite(weight) || weight < 0) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
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
  }

  async function upsertScale(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    const level = String(formData.get("level") ?? "").trim();
    const grade = String(formData.get("grade") ?? "").trim();
    const minScore = Number(String(formData.get("min_score") ?? "0").trim() || "0");
    const maxScore = Number(String(formData.get("max_score") ?? "0").trim() || "0");
    const active = String(formData.get("active") ?? "").trim() === "on";

    if (!level || !grade) return;
    if (!Number.isFinite(minScore) || !Number.isFinite(maxScore)) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase
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
  }

  function sumWeights(level: string) {
    return weightRows
      .filter((w) => w.level === level && w.active)
      .reduce((acc, w) => acc + Number(w.weight ?? 0), 0);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Academics</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Configuration</h1>
        <p className="mt-2 text-sm text-slate-600">
          Configure assessment weights and grading scales per level. Changes affect computed results immediately.
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Assessment weights</h2>
        <p className="mt-2 text-sm text-slate-600">For each level, active weights should add up to 100.</p>

        <div className="mt-6 space-y-8">
          {levels.map((lvl) => (
            <div key={lvl} className="rounded-2xl border border-slate-200 p-5">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{lvl}</div>
                  <div className="mt-1 text-xs text-slate-600">Active total: {sumWeights(lvl)}%</div>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                  <div className="col-span-4">Type</div>
                  <div className="col-span-3">Weight</div>
                  <div className="col-span-3">Active</div>
                  <div className="col-span-2">Save</div>
                </div>
                {weightRows.filter((w) => w.level === lvl).length ? (
                  weightRows
                    .filter((w) => w.level === lvl)
                    .map((w) => (
                      <div key={w.id} className="grid grid-cols-12 border-t border-slate-200 px-4 py-3 text-sm">
                        <form action={upsertWeight} className="col-span-12 grid grid-cols-12 gap-3">
                          <input type="hidden" name="id" value={w.id} />
                          <input type="hidden" name="level" value={w.level} />
                          <div className="col-span-4">
                            <input
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                              name="assessment_type"
                              defaultValue={w.assessment_type}
                              required
                            />
                          </div>
                          <div className="col-span-3">
                            <input
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                              name="weight"
                              type="number"
                              step="0.01"
                              defaultValue={String(w.weight)}
                              required
                            />
                          </div>
                          <div className="col-span-3 flex items-center">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                              <input className="h-4 w-4" name="active" type="checkbox" defaultChecked={w.active} />
                              Active
                            </label>
                          </div>
                          <div className="col-span-2">
                            <button
                              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-3 py-2 text-xs font-semibold text-white hover:brightness-95"
                              type="submit"
                            >
                              Save
                            </button>
                          </div>
                        </form>
                      </div>
                    ))
                ) : (
                  <div className="px-4 py-4 text-sm text-slate-600">No weights configured for this level yet.</div>
                )}
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold text-slate-600">Add new weight</div>
                <form action={upsertWeight} className="mt-2 grid grid-cols-12 gap-3">
                  <input type="hidden" name="id" value="" />
                  <input type="hidden" name="level" value={lvl} />
                  <div className="col-span-5">
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                      name="assessment_type"
                      placeholder="weekly_test"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                      name="weight"
                      type="number"
                      step="0.01"
                      placeholder="20"
                      required
                    />
                  </div>
                  <div className="col-span-2 flex items-center">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input className="h-4 w-4" name="active" type="checkbox" defaultChecked />
                      Active
                    </label>
                  </div>
                  <div className="col-span-2">
                    <button
                      className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                      type="submit"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Grading scales</h2>
        <p className="mt-2 text-sm text-slate-600">Configure grade bands per level (e.g., A=70-100).</p>

        <div className="mt-6 space-y-8">
          {levels.map((lvl) => (
            <div key={lvl} className="rounded-2xl border border-slate-200 p-5">
              <div className="text-sm font-semibold text-slate-900">{lvl}</div>

              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                <div className="grid grid-cols-12 bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-600">
                  <div className="col-span-2">Grade</div>
                  <div className="col-span-3">Min</div>
                  <div className="col-span-3">Max</div>
                  <div className="col-span-2">Active</div>
                  <div className="col-span-2">Save</div>
                </div>
                {scaleRows.filter((s) => s.level === lvl).length ? (
                  scaleRows
                    .filter((s) => s.level === lvl)
                    .map((s) => (
                      <div key={s.id} className="grid grid-cols-12 border-t border-slate-200 px-4 py-3 text-sm">
                        <form action={upsertScale} className="col-span-12 grid grid-cols-12 gap-3">
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="level" value={s.level} />
                          <div className="col-span-2">
                            <input
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                              name="grade"
                              defaultValue={s.grade}
                              required
                            />
                          </div>
                          <div className="col-span-3">
                            <input
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                              name="min_score"
                              type="number"
                              step="0.01"
                              defaultValue={String(s.min_score)}
                              required
                            />
                          </div>
                          <div className="col-span-3">
                            <input
                              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                              name="max_score"
                              type="number"
                              step="0.01"
                              defaultValue={String(s.max_score)}
                              required
                            />
                          </div>
                          <div className="col-span-2 flex items-center">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                              <input className="h-4 w-4" name="active" type="checkbox" defaultChecked={s.active} />
                              Active
                            </label>
                          </div>
                          <div className="col-span-2">
                            <button
                              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-3 py-2 text-xs font-semibold text-white hover:brightness-95"
                              type="submit"
                            >
                              Save
                            </button>
                          </div>
                        </form>
                      </div>
                    ))
                ) : (
                  <div className="px-4 py-4 text-sm text-slate-600">No grading scale configured for this level yet.</div>
                )}
              </div>

              <div className="mt-4">
                <div className="text-xs font-semibold text-slate-600">Add new grade band</div>
                <form action={upsertScale} className="mt-2 grid grid-cols-12 gap-3">
                  <input type="hidden" name="id" value="" />
                  <input type="hidden" name="level" value={lvl} />
                  <div className="col-span-2">
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                      name="grade"
                      placeholder="A"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                      name="min_score"
                      type="number"
                      step="0.01"
                      placeholder="70"
                      required
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                      name="max_score"
                      type="number"
                      step="0.01"
                      placeholder="100"
                      required
                    />
                  </div>
                  <div className="col-span-2 flex items-center">
                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                      <input className="h-4 w-4" name="active" type="checkbox" defaultChecked />
                      Active
                    </label>
                  </div>
                  <div className="col-span-2">
                    <button
                      className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50"
                      type="submit"
                    >
                      Add
                    </button>
                  </div>
                </form>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
