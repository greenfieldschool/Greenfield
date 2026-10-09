import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import SubmitButton from "@/components/submit-button";
import UrlToast from "@/components/url-toast";

type ClassRow = { id: string; level: string; name: string };
type SubjectRow = { id: string; name: string; level: string | null; active: boolean };
type AssignmentRow = { class_id: string; subject_id: string };

// Server actions live at module level so they cannot accidentally capture values from the page render.

function back(classId: string, message: string, type: "success" | "error" = "success"): never {
  revalidatePath("/admin/academics/class-subjects");
  revalidatePath("/admin/academics/subjects");
  revalidatePath("/admin/academics/results");
  const params = new URLSearchParams({ toast: message, toast_type: type });
  if (classId) params.set("class_id", classId);
  redirect(`/admin/academics/class-subjects?${params.toString()}`);
}

async function saveClassSubjects(formData: FormData) {
  "use server";

  const classId = String(formData.get("class_id") ?? "").trim();
  if (!classId) return;
  const wanted = new Set(
    formData
      .getAll("subject_id")
      .map((v) => String(v).trim())
      .filter(Boolean)
  );

  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { data: current, error: readError } = await supabase
    .from("class_subjects")
    .select("subject_id")
    .eq("class_id", classId);
  if (readError) back(classId, readError.message, "error");

  const have = new Set(((current ?? []) as Array<{ subject_id: string }>).map((r) => r.subject_id));
  const toAdd = Array.from(wanted).filter((id) => !have.has(id));
  const toRemove = Array.from(have).filter((id) => !wanted.has(id));

  if (toAdd.length) {
    const { error } = await supabase
      .from("class_subjects")
      .upsert(
        toAdd.map((subject_id) => ({ class_id: classId, subject_id })),
        { onConflict: "class_id,subject_id", ignoreDuplicates: true }
      );
    if (error) back(classId, error.message, "error");
  }
  if (toRemove.length) {
    const { error } = await supabase
      .from("class_subjects")
      .delete()
      .eq("class_id", classId)
      .in("subject_id", toRemove);
    if (error) back(classId, error.message, "error");
  }

  back(classId, `Saved ${wanted.size} subject(s) for this class`);
}

async function copyFromClass(formData: FormData) {
  "use server";

  const classId = String(formData.get("class_id") ?? "").trim();
  const fromClassId = String(formData.get("from_class_id") ?? "").trim();
  if (!classId) return;
  if (!fromClassId || fromClassId === classId) back(classId, "Choose another class to copy from", "error");

  const supabase = getSupabaseServerClient();
  if (!supabase) return;

  const { data: source } = await supabase.from("class_subjects").select("subject_id").eq("class_id", fromClassId);
  const rows = ((source ?? []) as Array<{ subject_id: string }>).map((r) => ({
    class_id: classId,
    subject_id: r.subject_id
  }));
  if (!rows.length) back(classId, "That class has no subjects assigned yet", "error");

  const { error } = await supabase
    .from("class_subjects")
    .upsert(rows, { onConflict: "class_id,subject_id", ignoreDuplicates: true });
  if (error) back(classId, error.message, "error");

  back(classId, `Added ${rows.length} subject(s) from the other class`);
}

export default async function AdminClassSubjectsPage({
  searchParams
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const sp = (await searchParams) ?? {};
  const classId = typeof sp.class_id === "string" ? sp.class_id.trim() : "";

  const [{ data: classes }, { data: subjects }, { data: assignments, error: assignmentsError }] = await Promise.all([
    supabase.from("classes").select("id, level, name").eq("active", true).order("level").order("name"),
    supabase.from("subjects").select("id, name, level, active").order("name"),
    supabase.from("class_subjects").select("class_id, subject_id")
  ]);

  const classRows = (classes ?? []) as ClassRow[];
  const subjectRows = (subjects ?? []) as SubjectRow[];
  const assignmentRows = (assignments ?? []) as AssignmentRow[];

  const countByClass = new Map<string, number>();
  for (const a of assignmentRows) countByClass.set(a.class_id, (countByClass.get(a.class_id) ?? 0) + 1);

  const cls = classRows.find((c) => c.id === classId) ?? null;
  const assigned = new Set(assignmentRows.filter((a) => a.class_id === classId).map((a) => a.subject_id));
  // Inactive subjects are only listed if the class still has them, so they can be unticked.
  const selectable = subjectRows.filter((s) => s.active || assigned.has(s.id));
  // Subjects tied to a different level than the class are listed last.
  const forLevel = selectable.filter((s) => !cls || !s.level || s.level === cls.level);
  const otherLevel = selectable.filter((s) => cls && s.level && s.level !== cls.level);

  const selectClass =
    "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green";

  const subjectCheckbox = (s: SubjectRow) => (
    <label
      key={s.id}
      className="flex items-center gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm hover:bg-slate-50 has-[:checked]:border-emerald-300 has-[:checked]:bg-emerald-50"
    >
      <input className="h-4 w-4" type="checkbox" name="subject_id" value={s.id} defaultChecked={assigned.has(s.id)} />
      <span className="font-medium text-slate-900">{s.name}</span>
      {s.level ? <span className="text-xs text-slate-500">{s.level}</span> : null}
      {!s.active ? <span className="text-xs text-amber-700">inactive</span> : null}
    </label>
  );

  return (
    <div className="space-y-6">
      <UrlToast />
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Academics</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Class subjects</h1>
        <p className="mt-2 text-sm text-slate-600">
          Choose the subjects each class takes. The result sheet only offers a class&apos;s own subjects, so teachers
          can&apos;t enter results under the wrong or duplicate subject. New subjects are added on the{" "}
          <Link className="font-semibold text-brand-green hover:underline" href="/admin/academics/subjects">
            Subjects
          </Link>{" "}
          page.
        </p>
        {assignmentsError ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Class subjects are not set up in the database yet. Run docs/migrations/20261009_subject_management.sql in
            Supabase. ({assignmentsError.message})
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">Classes</div>
          {classRows.length ? (
            classRows.map((c) => {
              const n = countByClass.get(c.id) ?? 0;
              const isSelected = c.id === classId;
              return (
                <Link
                  key={c.id}
                  href={`/admin/academics/class-subjects?class_id=${c.id}`}
                  className={`flex items-center justify-between border-t border-slate-200 px-6 py-3 text-sm first:border-t-0 ${
                    isSelected ? "bg-emerald-50 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span>
                    {c.level} - {c.name}
                  </span>
                  <span className={`text-xs ${n ? "text-slate-500" : "font-semibold text-amber-700"}`}>
                    {n ? `${n} subject${n === 1 ? "" : "s"}` : "none yet"}
                  </span>
                </Link>
              );
            })
          ) : (
            <div className="px-6 py-8 text-sm text-slate-600">No active classes.</div>
          )}
        </div>

        <div className="space-y-6 lg:col-span-2">
          {cls ? (
            <>
              <form action={saveClassSubjects} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <input type="hidden" name="class_id" value={cls.id} />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {cls.level} - {cls.name}
                    </h2>
                    <p className="text-sm text-slate-600">Tick every subject this class takes, then save.</p>
                  </div>
                  <SubmitButton
                    className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
                    pendingText="Saving…"
                  >
                    Save subjects
                  </SubmitButton>
                </div>
                {selectable.length ? (
                  <>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">{forLevel.map(subjectCheckbox)}</div>
                    {otherLevel.length ? (
                      <>
                        <div className="mt-6 text-xs font-semibold text-slate-500">Subjects set to another level</div>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">{otherLevel.map(subjectCheckbox)}</div>
                      </>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-4 text-sm text-slate-600">No active subjects. Add some on the Subjects page first.</div>
                )}
              </form>

              <form action={copyFromClass} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <input type="hidden" name="class_id" value={cls.id} />
                <div className="text-sm font-semibold text-slate-900">Copy subjects from another class</div>
                <p className="mt-1 text-xs text-slate-600">Adds that class&apos;s subjects to this one. Nothing is removed.</p>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <select className={selectClass} name="from_class_id" defaultValue="" required>
                    <option value="">Select class</option>
                    {classRows
                      .filter((c) => c.id !== cls.id && (countByClass.get(c.id) ?? 0) > 0)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.level} - {c.name} ({countByClass.get(c.id)} subjects)
                        </option>
                      ))}
                  </select>
                  <SubmitButton
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-60"
                    pendingText="Copying…"
                  >
                    Copy subjects
                  </SubmitButton>
                </div>
              </form>
            </>
          ) : (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-600">
              Pick a class on the left to choose its subjects.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
