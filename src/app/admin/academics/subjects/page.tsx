import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { cleanSubjectName, looseSubjectKey, subjectNameKey } from "@/lib/subjects";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";
import { BookOpen, CheckCircle2, GitMerge, Layers, Lock, Plus, School, Search, Trash2, UserCheck, X } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { FormSection, Field } from "@/components/ui/form-section";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const smallInputClass =
  "h-9 rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 shadow-sm outline-none transition focus:border-brand-green-500 focus:ring-4 focus:ring-brand-green-500/15";

type SubjectRow = {
  id: string;
  name: string;
  level: string | null;
  active: boolean;
  created_at: string;
};

type UsageRow = {
  subject_id: string;
  assessment_count: number;
  score_count: number;
  test_count: number;
  class_count: number;
};

const levels = ["creche", "primary", "secondary"] as const;

const DUPLICATE_MESSAGE = "A subject with this name and level already exists. Use Merge to combine duplicates.";

// Server actions live at module level so they cannot accidentally capture values from the page render.

function back(message: string, type: "success" | "error" = "success"): never {
  revalidatePath("/admin/academics/subjects");
  revalidatePath("/admin/academics/class-subjects");
  revalidatePath("/admin/academics/results");
  redirect(`/admin/academics/subjects?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

async function createSubject(formData: FormData) {
  "use server";

  const name = cleanSubjectName(String(formData.get("name") ?? ""));
  const levelRaw = String(formData.get("level") ?? "").trim();
  const active = String(formData.get("active") ?? "").trim() === "on";
  if (!name) back("Enter a subject name", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back("Database is not configured", "error");

  const { error } = await supabase.from("subjects").insert({
    name,
    level: levelRaw.length ? levelRaw : null,
    active
  });

  if (error) back(error.code === "23505" ? DUPLICATE_MESSAGE : error.message, "error");
  back("Subject created");
}

async function updateSubject(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  const name = cleanSubjectName(String(formData.get("name") ?? ""));
  const levelRaw = String(formData.get("level") ?? "").trim();
  if (!id) back("Missing subject", "error");
  if (!name) back("Enter a subject name", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back("Database is not configured", "error");

  const { error } = await supabase
    .from("subjects")
    .update({ name, level: levelRaw.length ? levelRaw : null })
    .eq("id", id);

  if (error) back(error.code === "23505" ? DUPLICATE_MESSAGE : error.message, "error");
  back("Subject updated");
}

async function toggleActive(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  const active = String(formData.get("active") ?? "").trim() === "true";
  if (!id) back("Missing subject", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back("Database is not configured", "error");

  const { error } = await supabase.from("subjects").update({ active: !active }).eq("id", id);
  if (error) back(error.message, "error");
  back(active ? "Subject deactivated" : "Subject activated");
}

async function deleteSubject(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  if (!id) back("Missing subject", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back("Database is not configured", "error");

  const { count } = await supabase
    .from("academic_assessments")
    .select("id", { count: "exact", head: true })
    .eq("subject_id", id);
  if ((count ?? 0) > 0) {
    back("This subject has results recorded. Merge it into the subject you are keeping instead of deleting it.", "error");
  }

  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) back(error.message, "error");
  back("Subject deleted");
}

async function mergeSubjects(formData: FormData) {
  "use server";

  const sourceId = String(formData.get("source_id") ?? "").trim();
  const targetId = String(formData.get("target_id") ?? "").trim();
  if (!sourceId || !targetId) back("Choose the duplicate to remove and the subject to keep", "error");
  if (sourceId === targetId) back("Choose two different subjects", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) back("Database is not configured", "error");

  const { error } = await supabase.rpc("merge_subjects", { p_source: sourceId, p_target: targetId });
  if (error) back(error.message, "error");
  back("Subjects merged. Results, CBT tests and class assignments were moved to the subject you kept.");
}

async function clearAllLevels() {
  "use server";

  const supabase = getSupabaseServerClient();
  if (!supabase) back("Database is not configured", "error");

  const { error } = await supabase.from("subjects").update({ level: null }).not("level", "is", null);
  if (error) back(error.code === "23505" ? `Some subjects would become duplicates. ${DUPLICATE_MESSAGE}` : error.message, "error");
  back("Levels removed from all subjects");
}

function usageText(u: UsageRow | undefined) {
  if (!u) return "Not used yet";
  const parts: string[] = [];
  if (u.score_count) parts.push(`${u.score_count} score${u.score_count === 1 ? "" : "s"}`);
  if (u.test_count) parts.push(`${u.test_count} CBT test${u.test_count === 1 ? "" : "s"}`);
  if (u.class_count) parts.push(`${u.class_count} class${u.class_count === 1 ? "" : "es"}`);
  return parts.length ? parts.join(" · ") : "Not used yet";
}

export default async function AdminSubjectsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const query = typeof sp.q === "string" ? sp.q.trim() : "";

  const [{ data }, { data: usageData }] = await Promise.all([
    supabase.from("subjects").select("id, name, level, active, created_at").order("name"),
    supabase.from("subject_usage").select("subject_id, assessment_count, score_count, test_count, class_count")
  ]);
  const subjects = (data ?? []) as SubjectRow[];
  const usageById = new Map(((usageData ?? []) as UsageRow[]).map((u) => [u.subject_id, u] as const));

  // Likely duplicates: names that match once case, spaces and punctuation are ignored.
  const groups = new Map<string, SubjectRow[]>();
  for (const s of subjects) {
    const key = looseSubjectKey(s.name);
    groups.set(key, [...(groups.get(key) ?? []), s]);
  }
  const scoreOf = (s: SubjectRow) => usageById.get(s.id)?.score_count ?? 0;
  const duplicateGroups = Array.from(groups.values())
    .filter((g) => g.length > 1)
    .map((g) =>
      // Suggest keeping the active subject with the most results, then the oldest.
      [...g].sort(
        (a, b) =>
          Number(b.active) - Number(a.active) || scoreOf(b) - scoreOf(a) || a.created_at.localeCompare(b.created_at)
      )
    );

  const exactDuplicateKeys = new Set(
    Array.from(
      subjects.reduce((acc, s) => {
        const key = `${subjectNameKey(s.name)}|${s.level ?? ""}`;
        acc.set(key, (acc.get(key) ?? 0) + 1);
        return acc;
      }, new Map<string, number>())
    )
      .filter(([, n]) => n > 1)
      .map(([key]) => key)
  );

  const visible = query
    ? subjects.filter((s) => s.name.toLowerCase().includes(query.toLowerCase()))
    : subjects;
  const subjectsWithLevel = subjects.filter((s) => s.level).length;
  const subjectLabel = (s: SubjectRow) => `${s.name}${s.level ? ` (${s.level})` : ""}${s.active ? "" : " — inactive"}`;

  const activeCount = subjects.filter((s) => s.active).length;

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Academics"
        title="Subjects"
        description={
          <>
            The school&apos;s subject list. Only admins can add, rename, merge or delete subjects. Choose which subjects
            each class takes under{" "}
            <Link className="gf-link" href="/admin/academics/class-subjects">
              Class subjects
            </Link>
            .
          </>
        }
        actions={
          <>
            <ButtonLink href="/admin/academics/class-subjects" variant="primary">
              <School className="h-4 w-4" aria-hidden="true" />
              Assign subjects to classes
            </ButtonLink>
            <ButtonLink href="/admin/academics/teachers" variant="secondary">
              <UserCheck className="h-4 w-4" aria-hidden="true" />
              Assign subjects to teachers
            </ButtonLink>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="All subjects" value={subjects.length} icon={BookOpen} tone="green" />
        <StatCard label="Active" value={activeCount} hint={`${subjects.length - activeCount} inactive`} icon={CheckCircle2} tone="blue" />
        <StatCard
          label="Possible duplicates"
          value={duplicateGroups.length}
          hint={duplicateGroups.length ? "Review and merge below" : "Nothing to merge"}
          icon={GitMerge}
          tone={duplicateGroups.length ? "gold" : "slate"}
        />
        <StatCard label="Tied to a level" value={subjectsWithLevel} hint="creche / primary / secondary" icon={Layers} tone="violet" />
      </div>

      {duplicateGroups.length ? (
        <Card className="!border-brand-gold-200">
          <CardHeader
            title={`Possible duplicates (${duplicateGroups.length})`}
            description="These subjects have the same name once capital letters, spaces and dots are ignored. Merging moves all results, CBT tests and class assignments onto the subject you keep, then deletes the duplicate. If both have a score for the same student and column, the kept subject's score is used."
            action={
              <Badge tone="gold" dot>
                Needs review
              </Badge>
            }
          />
          <CardBody className="space-y-3">
            {duplicateGroups.map((group) => {
              const [keep, ...rest] = group;
              return (
                <div key={keep.id} className="rounded-xl border border-brand-gold-200 bg-brand-gold-50/40 p-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                    <Badge tone="green">Keep</Badge>
                    <span className="font-semibold text-slate-900">{subjectLabel(keep)}</span>
                    <span className="text-xs text-slate-500">({usageText(usageById.get(keep.id))})</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {rest.map((dup) => (
                      <form
                        key={dup.id}
                        action={mergeSubjects}
                        className="flex flex-col gap-2 rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <input type="hidden" name="source_id" value={dup.id} />
                        <input type="hidden" name="target_id" value={keep.id} />
                        <span className="flex flex-wrap items-center gap-2 text-slate-700">
                          <Badge tone="red">Remove</Badge>
                          <span className="font-semibold text-slate-900">{subjectLabel(dup)}</span>
                          <span className="text-xs text-slate-500">({usageText(usageById.get(dup.id))})</span>
                        </span>
                        <ConfirmSubmitButton
                          confirmMessage={`Merge "${dup.name}" into "${keep.name}"? "${dup.name}" will be deleted and its results moved. This cannot be undone.`}
                          className={buttonClasses({ variant: "secondary", size: "sm" })}
                        >
                          <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
                          {`Merge into ${keep.name}`}
                        </ConfirmSubmitButton>
                      </form>
                    ))}
                  </div>
                </div>
              );
            })}
            <p className="text-xs text-slate-500">
              Not really duplicates? Rename one of them below so the names differ. To keep a different one than suggested,
              use &quot;Merge two subjects&quot;.
            </p>
          </CardBody>
        </Card>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <form action={createSubject} className="flex">
          <FormSection
            className="flex w-full flex-col [&>div:nth-child(2)]:flex-1"
            title="Add subject"
            description="New subjects become available to assign to classes."
            footer={
              <SubmitButton variant="primary" pendingText="Creating…">
                <span className="inline-flex items-center gap-2">
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Create subject
                </span>
              </SubmitButton>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="new-subject-name" required>
                <input id="new-subject-name" className="gf-input" name="name" placeholder="Mathematics" required />
              </Field>
              <Field label="Level" htmlFor="new-subject-level" hint="Optional">
                <select id="new-subject-level" className="gf-select" name="level" defaultValue="">
                  <option value="">(all)</option>
                  {levels.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
                <input className="gf-checkbox" name="active" type="checkbox" defaultChecked />
                Active
              </label>
            </div>
          </FormSection>
        </form>

        <form action={mergeSubjects} className="flex">
          <FormSection
            className="flex w-full flex-col [&>div:nth-child(2)]:flex-1"
            title="Merge two subjects"
            description={<>For duplicates that are spelled differently, e.g. &quot;Health habit&quot; and &quot;Health Habits&quot;.</>}
            footer={
              <ConfirmSubmitButton
                confirmMessage="Merge these subjects? The duplicate will be deleted and its results, CBT tests and class assignments moved to the subject you keep. This cannot be undone."
                className={buttonClasses({ variant: "danger" })}
              >
                <GitMerge className="h-4 w-4" aria-hidden="true" />
                Merge subjects
              </ConfirmSubmitButton>
            }
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Duplicate to remove" htmlFor="merge-source" required>
                <select id="merge-source" className="gf-select" name="source_id" defaultValue="" required>
                  <option value="">Select subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {subjectLabel(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Subject to keep" htmlFor="merge-target" required>
                <select id="merge-target" className="gf-select" name="target_id" defaultValue="" required>
                  <option value="">Select subject</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {subjectLabel(s)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </FormSection>
        </form>
      </div>

      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              All subjects <span className="text-sm font-normal text-slate-500">({subjects.length})</span>
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">Rename or change the level inline. Click the status to toggle it.</p>
          </div>
          <form className="flex items-center gap-2" action="/admin/academics/subjects" role="search">
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                aria-hidden="true"
              />
              <input
                className="gf-input h-9 py-0 pl-9 sm:w-56"
                name="q"
                defaultValue={query}
                placeholder="Search subjects"
                aria-label="Search subjects"
              />
            </div>
            <button type="submit" className={buttonClasses({ variant: "secondary", size: "sm" })}>
              Search
            </button>
            {query ? (
              <Link className={buttonClasses({ variant: "ghost", size: "sm" })} href="/admin/academics/subjects">
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </Link>
            ) : null}
          </form>
        </div>
        {visible.length ? (
          <ul className="divide-y divide-slate-100">
            {visible.map((s) => {
              const usage = usageById.get(s.id);
              const hasResults = (usage?.assessment_count ?? 0) > 0;
              const isExactDuplicate = exactDuplicateKeys.has(`${subjectNameKey(s.name)}|${s.level ?? ""}`);
              return (
                <li
                  key={s.id}
                  className="flex flex-col gap-3 px-5 py-3.5 text-sm transition-colors hover:bg-slate-50/70 sm:px-6 lg:flex-row lg:items-center"
                >
                  <form action={updateSubject} className="flex flex-1 flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      className={cn(smallInputClass, "min-w-[10rem] flex-1 font-semibold")}
                      name="name"
                      defaultValue={s.name}
                      aria-label="Subject name"
                      required
                    />
                    <select className={cn(smallInputClass, "w-36 pr-8")} name="level" defaultValue={s.level ?? ""} aria-label="Level">
                      <option value="">— (none)</option>
                      {levels.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <SubmitButton variant="ghost" size="sm" pendingText="Saving…" showSpinner={false}>
                      Save
                    </SubmitButton>
                  </form>
                  <div className="flex flex-wrap items-center gap-3 lg:w-[24rem] lg:justify-end">
                    <span className="text-xs text-slate-500">{usageText(usage)}</span>
                    {isExactDuplicate ? <Badge tone="gold">Duplicate</Badge> : null}
                    <form action={toggleActive}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={String(s.active)} />
                      <SubmitButton
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset transition disabled:opacity-60",
                          s.active
                            ? "bg-brand-green-50 text-brand-green-700 ring-brand-green-200/70 hover:bg-brand-green-100"
                            : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200"
                        )}
                        pendingText="Saving…"
                        showSpinner={false}
                      >
                        <span className="inline-flex items-center gap-1.5" title={s.active ? "Click to deactivate" : "Click to activate"}>
                          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
                          {s.active ? "Active" : "Inactive"}
                        </span>
                      </SubmitButton>
                    </form>
                    {hasResults ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-slate-400"
                        title="Subjects with results can only be removed by merging"
                      >
                        <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                        Has results
                      </span>
                    ) : (
                      <form action={deleteSubject}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Delete "${s.name}"?${
                            usage?.test_count ? ` ${usage.test_count} CBT test(s) will be left without a subject.` : ""
                          } This cannot be undone.`}
                          title={`Delete ${s.name}`}
                          className="inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={query ? Search : BookOpen}
            title={query ? "No subjects match your search." : "No subjects yet."}
            description={query ? "Try a different name or clear the search." : "Add your first subject above."}
          />
        )}
      </Card>

      {subjectsWithLevel > 0 ? (
        <FormSection
          title="Danger zone"
          description="Bulk changes that affect every subject."
          className="!border-red-200"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-600">
              Remove the level from all {subjectsWithLevel} subject(s) so they are no longer tied to creche, primary or
              secondary.
            </p>
            <form action={clearAllLevels} className="shrink-0">
              <ConfirmSubmitButton
                confirmMessage={`Remove the level from all ${subjectsWithLevel} subject(s)? Subjects will no longer be tied to creche/primary/secondary.`}
                className={buttonClasses({ variant: "danger" })}
              >
                Remove level from all subjects
              </ConfirmSubmitButton>
            </form>
          </div>
        </FormSection>
      ) : null}
    </div>
  );
}
