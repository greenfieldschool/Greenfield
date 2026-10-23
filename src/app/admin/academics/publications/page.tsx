import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";
import { firstOrNull } from "@/lib/relations";
import { EyeOff, FileSpreadsheet, Megaphone, Send } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";

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

function pubBack(message: string, type: "success" | "error" = "success"): never {
  redirect(`/admin/academics/publications?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

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

    if (!scope || !academicYearId || !academicTermId || !classId) {
      pubBack("Choose a scope, class, year and term", "error");
    }

    const supabase = getSupabaseServerClient();
    if (!supabase) pubBack("Database is not configured", "error");

    const {
      data: { user }
    } = await supabase.auth.getUser();

    // Looked up here rather than via classRows: inline server actions cannot capture array methods.
    const { data: cls } = await supabase.from("classes").select("level").eq("id", classId).maybeSingle();

    const { error } = await supabase
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
    if (error) pubBack(error.message, "error");
    pubBack("Results published");
  }

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Academics"
        title="Result publications"
        description="Publish or unpublish student results visibility in the portal."
        actions={
          <ButtonLink href="/admin/academics/results" variant="secondary">
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            Result sheet
          </ButtonLink>
        }
      />

      <form action={publish}>
        <FormSection
          title="Publish results"
          description="Students and parents in the chosen class will see that term's results in the portal."
          footer={
            <SubmitButton variant="primary" pendingText="Publishing…">
              <span className="inline-flex items-center gap-2">
                <Send className="h-4 w-4" aria-hidden="true" />
                Publish
              </span>
            </SubmitButton>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Scope" htmlFor="pub-scope">
              <select id="pub-scope" className="gf-select" name="scope" defaultValue={scopes[0]}>
                {scopes.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Class" htmlFor="pub-class" required>
              <select id="pub-class" className="gf-select" name="class_id" defaultValue="" required>
                <option value="">Select class</option>
                {classRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.level} - {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic year" htmlFor="pub-year" required>
              <select id="pub-year" className="gf-select" name="academic_year_id" defaultValue="" required>
                <option value="">Select year</option>
                {yearRows.map((y) => (
                  <option key={y.id} value={y.id}>
                    {y.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Academic term" htmlFor="pub-term" required>
              <select id="pub-term" className="gf-select" name="academic_term_id" defaultValue="" required>
                <option value="">Select term</option>
                {termRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Notes" htmlFor="pub-notes" hint="Optional" className="sm:col-span-2">
              <input id="pub-notes" className="gf-input" name="notes" placeholder="e.g. Term 2 results published" />
            </Field>
          </div>
        </FormSection>
      </form>

      <Card>
        <CardHeader title="Published results" description={`${publicationRows.length} publication${publicationRows.length === 1 ? "" : "s"}`} />
        {publicationRows.length ? (
          <div className="gf-table-wrap">
            <table className="gf-table min-w-[720px]">
              <thead>
                <tr>
                  <th scope="col">Scope</th>
                  <th scope="col">Year / term</th>
                  <th scope="col">Class</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {publicationRows.map((p) => {
                  const year = firstOrNull(p.academic_years);
                  const term = firstOrNull(p.academic_terms);
                  const cls = firstOrNull(p.classes);
                  return (
                    <tr key={p.id}>
                      <td>
                        <div className="font-semibold text-slate-900">{p.scope}</div>
                        {p.notes ? <div className="mt-0.5 text-xs text-slate-500">{p.notes}</div> : null}
                      </td>
                      <td>{(year?.name ?? "—") + " / " + (term?.name ?? "—")}</td>
                      <td>{cls ? `${cls.level} - ${cls.name}` : "—"}</td>
                      <td>
                        <Badge tone="green" dot>
                          Published
                        </Badge>
                        <div className="mt-1 text-xs text-slate-500">
                          {new Date(p.published_at).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            timeZone: "Africa/Lagos"
                          })}
                        </div>
                      </td>
                      <td className="text-right">
                        {/* Unpublishing needs an admin and a reason (kept in the audit log), on the Report cards page. */}
                        <ButtonLink
                          href={`/admin/academics/reports?class_id=${p.class_id ?? ""}&term_id=${p.academic_term_id ?? ""}`}
                          variant="secondary"
                          size="sm"
                        >
                          <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                          Manage
                        </ButtonLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={Megaphone}
            title="No publications yet"
            description="Published results will appear here. Use the form above or the result sheet to publish."
          />
        )}
      </Card>
    </div>
  );
}
