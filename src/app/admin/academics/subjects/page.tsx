import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { cleanSubjectName, looseSubjectKey, subjectNameKey } from "@/lib/subjects";
import SubmitButton from "@/components/submit-button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import UrlToast from "@/components/url-toast";

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
  if (!supabase) return;

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
  if (!id) return;
  if (!name) back("Enter a subject name", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) return;

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
  if (!id) return;

  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { error } = await supabase.from("subjects").update({ active: !active }).eq("id", id);
  if (error) back(error.message, "error");
  back(active ? "Subject deactivated" : "Subject activated");
}

async function deleteSubject(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const supabase = getSupabaseServerClient();
  if (!supabase) return;

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
  if (!supabase) return;

  const { error } = await supabase.rpc("merge_subjects", { p_source: sourceId, p_target: targetId });
  if (error) back(error.message, "error");
  back("Subjects merged. Results, CBT tests and class assignments were moved to the subject you kept.");
}

async function clearAllLevels() {
  "use server";

  const supabase = getSupabaseServerClient();
  if (!supabase) return;

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

  const inputClass =
    "mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green";
  const smallInputClass =
    "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-brand-green";

  return (
    <div className="space-y-6">
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Academics</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Subjects</h1>
        <p className="mt-2 text-sm text-slate-600">
          The school&apos;s subject list. Only admins can add, rename, merge or delete subjects. Choose which subjects
          each class takes under{" "}
          <Link className="font-semibold text-brand-green hover:underline" href="/admin/academics/class-subjects">
            Class subjects
          </Link>
          .
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/admin/academics/class-subjects"
            className="inline-flex items-center justify-center rounded-xl bg-brand-green px-4 py-2 text-sm font-semibold text-white hover:brightness-95"
          >
            Assign subjects to classes
          </Link>
          {subjectsWithLevel > 0 ? (
            <form action={clearAllLevels}>
              <ConfirmSubmitButton
                confirmMessage={`Remove the level from all ${subjectsWithLevel} subject(s)? Subjects will no longer be tied to creche/primary/secondary.`}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
              >
                Remove level from all subjects
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {duplicateGroups.length ? (
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Possible duplicates ({duplicateGroups.length})</h2>
          <p className="mt-1 text-sm text-slate-700">
            These subjects have the same name once capital letters, spaces and dots are ignored. Merging moves all
            results, CBT tests and class assignments onto the subject you keep, then deletes the duplicate. If both
            have a score for the same student and column, the kept subject&apos;s score is used.
          </p>
          <div className="mt-4 space-y-3">
            {duplicateGroups.map((group) => {
              const [keep, ...rest] = group;
              return (
                <div key={keep.id} className="rounded-2xl border border-amber-200 bg-white p-4">
                  <div className="text-sm text-slate-700">
                    Suggested to keep: <span className="font-semibold text-slate-900">{subjectLabel(keep)}</span>{" "}
                    <span className="text-xs text-slate-500">({usageText(usageById.get(keep.id))})</span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {rest.map((dup) => (
                      <form key={dup.id} action={mergeSubjects} className="flex flex-wrap items-center gap-2 text-sm">
                        <input type="hidden" name="source_id" value={dup.id} />
                        <input type="hidden" name="target_id" value={keep.id} />
                        <span className="text-slate-700">
                          Remove <span className="font-semibold text-slate-900">{subjectLabel(dup)}</span>{" "}
                          <span className="text-xs text-slate-500">({usageText(usageById.get(dup.id))})</span>
                        </span>
                        <ConfirmSubmitButton
                          confirmMessage={`Merge "${dup.name}" into "${keep.name}"? "${dup.name}" will be deleted and its results moved. This cannot be undone.`}
                          className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                        >
                          {`Merge into ${keep.name}`}
                        </ConfirmSubmitButton>
                      </form>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-slate-600">
            Not really duplicates? Rename one of them below so the names differ. To keep a different one than suggested,
            use &quot;Merge two subjects&quot;.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Add subject</h2>
          <form action={createSubject} className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-900">Name</label>
              <input className={inputClass} name="name" placeholder="Mathematics" required />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Level (optional)</label>
              <select className={inputClass} name="level" defaultValue="">
                <option value="">(all)</option>
                {levels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
              <label className="mt-2 flex items-center gap-2 text-xs font-semibold text-slate-700">
                <input className="h-4 w-4" name="active" type="checkbox" defaultChecked />
                Active
              </label>
            </div>
            <div className="sm:col-span-2">
              <SubmitButton
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                pendingText="Creating…"
              >
                Create subject
              </SubmitButton>
            </div>
          </form>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Merge two subjects</h2>
          <p className="mt-1 text-sm text-slate-600">
            For duplicates that are spelled differently, e.g. &quot;Health habit&quot; and &quot;Health Habits&quot;.
          </p>
          <form action={mergeSubjects} className="mt-4 grid gap-4">
            <div>
              <label className="text-sm font-semibold text-slate-900">Duplicate to remove</label>
              <select className={inputClass} name="source_id" defaultValue="" required>
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {subjectLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Subject to keep</label>
              <select className={inputClass} name="target_id" defaultValue="" required>
                <option value="">Select subject</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {subjectLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <ConfirmSubmitButton
              confirmMessage="Merge these subjects? The duplicate will be deleted and its results, CBT tests and class assignments moved to the subject you keep. This cannot be undone."
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
            >
              Merge subjects
            </ConfirmSubmitButton>
          </form>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-semibold text-slate-900">
            All subjects <span className="text-sm font-normal text-slate-500">({subjects.length})</span>
          </div>
          <form className="flex gap-2" action="/admin/academics/subjects">
            <input className={smallInputClass} name="q" defaultValue={query} placeholder="Search subjects" />
            <button className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-900 hover:bg-slate-50">
              Search
            </button>
            {query ? (
              <Link className="self-center text-sm font-semibold text-brand-green hover:underline" href="/admin/academics/subjects">
                Clear
              </Link>
            ) : null}
          </form>
        </div>
        <div>
          {visible.length ? (
            visible.map((s) => {
              const usage = usageById.get(s.id);
              const hasResults = (usage?.assessment_count ?? 0) > 0;
              const isExactDuplicate = exactDuplicateKeys.has(`${subjectNameKey(s.name)}|${s.level ?? ""}`);
              return (
                <div
                  key={s.id}
                  className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 text-sm first:border-t-0 lg:flex-row lg:items-center"
                >
                  <form action={updateSubject} className="flex flex-1 flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={s.id} />
                    <input
                      className={`${smallInputClass} min-w-0 flex-1 font-semibold text-slate-900`}
                      name="name"
                      defaultValue={s.name}
                      aria-label="Subject name"
                      required
                    />
                    <select className={smallInputClass} name="level" defaultValue={s.level ?? ""} aria-label="Level">
                      <option value="">— (none)</option>
                      {levels.map((l) => (
                        <option key={l} value={l}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <SubmitButton
                      className="text-xs font-semibold text-brand-green hover:underline disabled:opacity-60"
                      pendingText="Saving…"
                      showSpinner={false}
                    >
                      Save
                    </SubmitButton>
                  </form>
                  <div className="flex flex-wrap items-center gap-4 lg:w-[22rem] lg:justify-end">
                    <span className="text-xs text-slate-500">
                      {usageText(usage)}
                      {isExactDuplicate ? <span className="ml-2 font-semibold text-amber-700">Duplicate</span> : null}
                    </span>
                    <form action={toggleActive}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="active" value={String(s.active)} />
                      <SubmitButton
                        className={`text-xs font-semibold hover:underline disabled:opacity-60 ${
                          s.active ? "text-brand-green" : "text-slate-500"
                        }`}
                        pendingText="Saving…"
                        showSpinner={false}
                      >
                        {s.active ? "Active" : "Inactive"}
                      </SubmitButton>
                    </form>
                    {hasResults ? (
                      <span className="text-xs text-slate-400" title="Subjects with results can only be removed by merging">
                        Has results
                      </span>
                    ) : (
                      <form action={deleteSubject}>
                        <input type="hidden" name="id" value={s.id} />
                        <ConfirmSubmitButton
                          confirmMessage={`Delete "${s.name}"?${
                            usage?.test_count ? ` ${usage.test_count} CBT test(s) will be left without a subject.` : ""
                          } This cannot be undone.`}
                          className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-60"
                        >
                          Delete
                        </ConfirmSubmitButton>
                      </form>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">{query ? "No subjects match your search." : "No subjects yet."}</div>
          )}
        </div>
      </div>
    </div>
  );
}
