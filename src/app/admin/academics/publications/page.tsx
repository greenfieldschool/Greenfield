import { revalidatePath } from "next/cache";
import { getSupabaseServerClient } from "@/lib/supabase/server";

type YearRow = { id: string; name: string };

type TermRow = { id: string; name: string };

type ClassRow = { id: string; level: string; name: string };

type PublicationRow = {
  id: string;
  scope: string;
  academic_year_id: string | null;
  academic_term_id: string | null;
  level: string | null;
  class_id: string | null;
  published_at: string;
  notes: string | null;
  academic_years: Array<{ id: string; name: string }>;
  academic_terms: Array<{ id: string; name: string }>;
  classes: Array<{ id: string; level: string; name: string }>;
};

const scopes = ["term_results"] as const;

export default async function AdminAcademicsPublicationsPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: years }, { data: terms }, { data: classes }, { data: pubs }] = await Promise.all([
    supabase.from("academic_years").select("id, name").order("name", { ascending: false }),
    supabase.from("academic_terms").select("id, name").order("starts_on", { ascending: false }),
    supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
    supabase
      .from("result_publications")
      .select(
        "id, scope, academic_year_id, academic_term_id, level, class_id, published_at, notes, academic_years(id, name), academic_terms(id, name), classes(id, level, name)"
      )
      .order("published_at", { ascending: false })
      .limit(200)
  ]);

  const yearRows = (years ?? []) as YearRow[];
  const termRows = (terms ?? []) as TermRow[];
  const classRows = (classes ?? []) as ClassRow[];
  const publicationRows = (pubs ?? []) as unknown as PublicationRow[];

  async function publish(formData: FormData) {
    "use server";

    const scope = String(formData.get("scope") ?? "").trim();
    const academicYearId = String(formData.get("academic_year_id") ?? "").trim();
    const academicTermId = String(formData.get("academic_term_id") ?? "").trim();
    const classId = String(formData.get("class_id") ?? "").trim();
    const notes = String(formData.get("notes") ?? "").trim();

    if (!scope || !academicYearId || !academicTermId || !classId) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    const {
      data: { user }
    } = await supabase.auth.getUser();

    const cls = classRows.find((c) => c.id === classId) ?? null;

    await supabase
      .from("result_publications")
      .upsert(
        {
          scope,
          academic_year_id: academicYearId,
          academic_term_id: academicTermId,
          level: cls?.level ?? null,
          class_id: classId,
          published_at: new Date().toISOString(),
          published_by: user?.id ?? null,
          notes: notes.length ? notes : null
        },
        { onConflict: "scope,academic_year_id,academic_term_id,level,class_id" }
      );

    revalidatePath("/admin/academics/publications");
    revalidatePath("/portal/academics");
  }

  async function unpublish(formData: FormData) {
    "use server";

    const id = String(formData.get("id") ?? "").trim();
    if (!id) return;

    const supabase = getSupabaseServerClient();
    if (!supabase) return;

    await supabase.from("result_publications").delete().eq("id", id);

    revalidatePath("/admin/academics/publications");
    revalidatePath("/portal/academics");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Academics</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Result publications</h1>
        <p className="mt-2 text-sm text-slate-600">Publish or unpublish student results visibility in the portal.</p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Publish</h2>
        <form action={publish} className="mt-4 grid gap-4 sm:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Scope</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="scope"
              defaultValue={scopes[0]}
            >
              {scopes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Class</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="class_id"
              defaultValue=""
              required
            >
              <option value="">Select class</option>
              {classRows.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.level} - {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Academic year</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_year_id"
              defaultValue=""
              required
            >
              <option value="">Select year</option>
              {yearRows.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Academic term</label>
            <select
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="academic_term_id"
              defaultValue=""
              required
            >
              <option value="">Select term</option>
              {termRows.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-semibold text-slate-900">Notes (optional)</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              name="notes"
              placeholder="e.g. Term 2 results published"
            />
          </div>

          <div className="flex items-end sm:col-span-2">
            <button
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              type="submit"
            >
              Publish
            </button>
          </div>
        </form>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="grid grid-cols-12 gap-0 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-3">Scope</div>
          <div className="col-span-4">Year / Term</div>
          <div className="col-span-4">Class</div>
          <div className="col-span-1">Status</div>
        </div>
        <div>
          {publicationRows.length ? (
            publicationRows.map((p) => {
              const year = (p.academic_years ?? [])[0] ?? null;
              const term = (p.academic_terms ?? [])[0] ?? null;
              const cls = (p.classes ?? [])[0] ?? null;
              return (
                <div key={p.id} className="grid grid-cols-12 gap-0 border-t border-slate-200 px-6 py-4 text-sm">
                  <div className="col-span-3 font-semibold text-slate-900">{p.scope}</div>
                  <div className="col-span-4 text-slate-700">
                    {(year?.name ?? "—") + " / " + (term?.name ?? "—")}
                  </div>
                  <div className="col-span-4 text-slate-700">{cls ? `${cls.level} - ${cls.name}` : "—"}</div>
                  <div className="col-span-1">
                    <form action={unpublish}>
                      <input type="hidden" name="id" value={p.id} />
                      <button className="text-xs font-semibold text-brand-green hover:underline" type="submit">
                        Unpublish
                      </button>
                    </form>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No publications yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
