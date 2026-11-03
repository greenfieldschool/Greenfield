import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { CalendarCheck, CalendarRange, ClipboardList } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { termWeeks } from "@/lib/welfare";
import { toLagosDateInput } from "@/lib/lagos-dates";
import UrlToast from "@/components/url-toast";
import SubmitButton from "@/components/submit-button";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { LEARN } from "@/lib/learn-guides";
import { cn } from "@/lib/cn";

// Admin only (route-access + the database function): which weeks of a term class teachers must fill on the welfare
// score sheet. Report cards can't be published for a class until every pupil is scored for every compulsory week.

const PATH = "/admin/welfare/weeks";

type TermRow = {
  id: string;
  name: string;
  starts_on: string | null;
  ends_on: string | null;
  is_active: boolean | null;
  academic_years: { name: string } | { name: string }[] | null;
};

function back(termId: string, message: string, type: "success" | "error" = "success"): never {
  revalidatePath(PATH);
  revalidatePath("/admin/welfare/scores");
  revalidatePath("/admin/academics/reports");
  redirect(`${PATH}?term_id=${encodeURIComponent(termId)}&toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

async function saveCompulsoryWeeks(formData: FormData) {
  "use server";
  const termId = String(formData.get("term_id") ?? "").trim();
  const preset = String(formData.get("preset") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase || !termId) back(termId, "Choose a term first", "error");

  let weeks = formData.getAll("week").map((w) => String(w)).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w));
  if (preset === "none") weeks = [];
  if (preset === "all") {
    const { data: term } = await supabase.from("academic_terms").select("starts_on, ends_on").eq("id", termId).maybeSingle();
    const t = term as { starts_on: string | null; ends_on: string | null } | null;
    weeks = termWeeks(t?.starts_on ?? null, t?.ends_on ?? null, [], toLagosDateInput(new Date().toISOString())).map((w) => w.start);
  }

  const { error } = await supabase.rpc("set_welfare_compulsory_weeks", { p_term: termId, p_weeks: weeks });
  if (error) {
    const missingUpdate = /set_welfare_compulsory_weeks|welfare_compulsory_weeks/.test(error.message) && /does not exist|schema cache|function/i.test(error.message);
    back(
      termId,
      missingUpdate
        ? "This needs a database update first: ask the school's IT person to run 20261104_welfare_compulsory_weeks.sql."
        : /Only admins/.test(error.message)
          ? "Only admins can choose the compulsory weeks."
          : "Couldn't save the weeks. Please try again.",
      "error"
    );
  }
  back(termId, weeks.length ? `Saved: ${weeks.length} compulsory week${weeks.length === 1 ? "" : "s"}.` : "Saved: no weeks are compulsory this term.");
}

const yearName = (t: TermRow) => {
  const y = Array.isArray(t.academic_years) ? t.academic_years[0] : t.academic_years;
  return y?.name ?? "";
};

export default async function CompulsoryWeeksPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: termData } = await supabase
    .from("academic_terms")
    .select("id, name, starts_on, ends_on, is_active, academic_years(name)")
    .order("starts_on", { ascending: false, nullsFirst: false });
  const terms = (termData ?? []) as TermRow[];
  const requested = typeof sp.term_id === "string" ? sp.term_id : "";
  const term = terms.find((t) => t.id === requested) ?? terms.find((t) => t.is_active) ?? terms[0] ?? null;

  const { data: chosenData, error: chosenError } = term
    ? await supabase.from("welfare_compulsory_weeks").select("week_start").eq("academic_term_id", term.id)
    : { data: [], error: null };
  const chosen = new Set(((chosenData ?? []) as Array<{ week_start: string }>).map((w) => String(w.week_start).slice(0, 10)));
  const today = toLagosDateInput(new Date().toISOString());
  const weeks = term ? termWeeks(term.starts_on, term.ends_on, [], today, Array.from(chosen)) : [];

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        learn={LEARN.welfare}
        eyebrow="Welfare"
        title="Compulsory weeks"
        description="Choose the weeks class teachers must fill on the welfare score sheet each term, for example every school week except the mid-term break. Report cards can't be published for a class until every pupil has been scored for every compulsory week."
        actions={
          <ButtonLink href="/admin/welfare/scores" variant="secondary">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            Welfare score sheet
          </ButtonLink>
        }
      />

      {chosenError ? (
        <Alert tone="warning">This needs a database update first. Ask the school&apos;s IT person to run 20261104_welfare_compulsory_weeks.sql.</Alert>
      ) : null}

      <Card>
        <CardHeader title="Term" />
        <CardBody>
          {terms.length ? (
            <form method="get" action={PATH} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label htmlFor="term_id" className="gf-label">
                  Term
                </label>
                <select id="term_id" name="term_id" defaultValue={term?.id} className="gf-select">
                  {terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {[yearName(t), t.name].filter(Boolean).join(" · ")}
                      {t.is_active ? " (current)" : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={buttonClasses({ variant: "secondary" })}>
                Open
              </button>
            </form>
          ) : (
            <EmptyState icon={CalendarRange} title="No terms yet" description="Add the academic year and its terms under Finance → Fees setup first." />
          )}
        </CardBody>
      </Card>

      {term ? (
        <Card>
          <CardHeader
            title={`Weeks of ${[yearName(term), term.name].filter(Boolean).join(" · ")}`}
            description={
              weeks.length
                ? `${weeks.length} weeks from the term's start and end dates. Tick the weeks that must be filled, then save.`
                : undefined
            }
            action={
              <Badge tone={chosen.size ? "green" : "slate"} dot>
                {chosen.size ? `${chosen.size} of ${weeks.length} compulsory` : "None compulsory"}
              </Badge>
            }
          />
          {!weeks.length ? (
            <CardBody>
              <Alert tone="warning">
                This term has no start and end dates, so it has no weeks yet. Set them under Finance → Fees setup → Academic years.
              </Alert>
            </CardBody>
          ) : (
            <form action={saveCompulsoryWeeks}>
              <input type="hidden" name="term_id" value={term.id} />
              <ul className="grid gap-2 px-5 pb-2 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
                {weeks.map((w) => (
                  <li key={w.start}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 transition has-[:checked]:border-brand-green-400 has-[:checked]:bg-brand-green-50",
                        "border-slate-200 bg-white hover:border-brand-green-200"
                      )}
                    >
                      <input type="checkbox" name="week" value={w.start} defaultChecked={w.compulsory} className="h-5 w-5 rounded border-slate-300 text-brand-green focus:ring-brand-green-500" />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                          Week {w.number}
                          {w.current ? <span className="rounded-full bg-brand-green-600 px-1.5 py-px text-[10px] font-semibold text-white">This week</span> : null}
                        </span>
                        <span className="block text-xs text-slate-500">{w.range}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-5 py-4 sm:px-6">
                <SubmitButton>
                  <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                  Save compulsory weeks
                </SubmitButton>
                <button type="submit" name="preset" value="all" className={buttonClasses({ variant: "secondary" })}>
                  Make every week compulsory
                </button>
                <button type="submit" name="preset" value="none" className={buttonClasses({ variant: "ghost" })}>
                  None compulsory
                </button>
              </div>
            </form>
          )}
        </Card>
      ) : null}
    </div>
  );
}
