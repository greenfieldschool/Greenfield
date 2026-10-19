import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetch-all";
import { ChevronRight, GitMerge, School, Settings2, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import ConfirmSubmitButton from "@/components/confirm-submit-button";
import { deleteClassAction, mergeClassAction } from "./actions";
import { cn } from "@/lib/cn";
import { classNameKey } from "@/lib/class-names";
import UrlToast from "@/components/url-toast";

type ClassRow = { id: string; level: string; name: string; active: boolean };
type StudentRow = { class_id: string | null; status: string };

const levelOrder: Record<string, number> = { creche: 0, primary: 1, secondary: 2 };
const currentStatuses = new Set(["active", "enrolled"]);

export default async function AdminClassesPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const [{ data: classData }, students] = await Promise.all([
    supabase.from("classes").select("id, level, name, active").order("level").order("name"),
    fetchAllRows<StudentRow>(() => supabase.from("students").select("class_id, status").order("id"))
  ]);

  const classes = ((classData ?? []) as ClassRow[]).sort(
    (a, b) => (levelOrder[a.level] ?? 9) - (levelOrder[b.level] ?? 9) || a.name.localeCompare(b.name)
  );

  const counts = new Map<string, { current: number; total: number }>();
  let unassigned = 0;
  for (const s of students) {
    if (!s.class_id) {
      if (currentStatuses.has(s.status)) unassigned += 1;
      continue;
    }
    const c = counts.get(s.class_id) ?? { current: 0, total: 0 };
    c.total += 1;
    if (currentStatuses.has(s.status)) c.current += 1;
    counts.set(s.class_id, c);
  }

  const levels = Array.from(new Set(classes.map((c) => c.level)));

  // Classes with the same name (ignoring case, spaces and dashes), e.g. "JSS 1" and "JSS1" or "Reception" and "RECEPTION",
  // whichever level they were registered under. The one with the most students (then the active one) is kept.
  const byKey = new Map<string, ClassRow[]>();
  for (const c of classes) {
    const key = classNameKey(c.name);
    byKey.set(key, [...(byKey.get(key) ?? []), c]);
  }
  const totalOf = (c: ClassRow) => counts.get(c.id)?.total ?? 0;
  const duplicateGroups = Array.from(byKey.values())
    .filter((g) => g.length > 1)
    .map((g) => [...g].sort((a, b) => totalOf(b) - totalOf(a) || Number(b.active) - Number(a.active) || a.name.localeCompare(b.name)));

  // Classes nobody is in: the ones that can be deleted (the database still refuses if fees, results or exams use them).
  const duplicateIds = new Set(duplicateGroups.flat().map((c) => c.id));
  const emptyClasses = classes.filter((c) => totalOf(c) === 0 && !duplicateIds.has(c.id));

  return (
    <div className="space-y-6">
      <UrlToast />
      <PageHeader
        eyebrow="Core"
        title="Classes"
        description="Open a class to see the children in it and correct anything that was registered wrongly (name, admission number, class or status). Admins can also delete or merge a class from there."
        actions={
          <ButtonLink href="/admin/finance/fees/classes" variant="secondary">
            <Settings2 className="h-4 w-4" aria-hidden="true" />
            Add or deactivate classes
          </ButtonLink>
        }
      />

      {unassigned > 0 ? (
        <Alert
          tone="warning"
          action={
            <Link className="text-sm font-semibold underline-offset-4 hover:underline" href="/admin/classes/unassigned">
              Review
            </Link>
          }
        >
          <Link className="font-semibold hover:underline" href="/admin/classes/unassigned">
            {unassigned} current student{unassigned === 1 ? " has" : "s have"} no class
          </Link>
        </Alert>
      ) : null}

      {duplicateGroups.length ? (
        <Card className="!border-brand-gold-200">
          <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
            <h2 className="text-base font-semibold text-slate-900">Classes registered twice</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Merging moves the students, results, attendance, fees, exams, subjects and teachers of the duplicate onto the class
              you keep, then deletes the duplicate.
            </p>
          </div>
          <div className="space-y-4 px-5 py-5 sm:px-6">
            {duplicateGroups.map(([keep, ...rest]) => (
              <div key={keep.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone="green">Keep</Badge>
                  <Link className="font-semibold text-slate-900 hover:underline" href={`/admin/classes/${keep.id}`}>
                    {keep.name}
                  </Link>
                  <span className="text-xs capitalize text-slate-500">
                    {keep.level} · {totalOf(keep)} student{totalOf(keep) === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {rest.map((dup) => (
                    <form
                      key={dup.id}
                      action={mergeClassAction}
                      className="flex flex-col gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                    >
                      <input type="hidden" name="source_id" value={dup.id} />
                      <input type="hidden" name="target_id" value={keep.id} />
                      <input type="hidden" name="return_to" value="/admin/classes" />
                      <span className="flex flex-wrap items-center gap-2 text-slate-700">
                        <Badge tone="red">Remove</Badge>
                        <Link className="font-semibold text-slate-900 hover:underline" href={`/admin/classes/${dup.id}`}>
                          {dup.name}
                        </Link>
                        <span className="text-xs capitalize text-slate-500">
                          {dup.level} · {totalOf(dup)} student{totalOf(dup) === 1 ? "" : "s"}
                        </span>
                      </span>
                      <ConfirmSubmitButton
                        confirmMessage={`Merge "${dup.name}" into "${keep.name}"? "${dup.name}" will be deleted and everything in it moved. This cannot be undone.`}
                        className={buttonClasses({ variant: "secondary", size: "sm" })}
                      >
                        <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
                        {`Merge into ${keep.name}`}
                      </ConfirmSubmitButton>
                    </form>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {emptyClasses.length ? (
        <details className="group rounded-2xl border border-slate-200/80 bg-white shadow-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-5 py-4 text-sm font-semibold text-slate-900 sm:px-6 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
              Delete a class nobody is in ({emptyClasses.length})
            </span>
            <ChevronRight className="h-4 w-4 text-slate-400 transition group-open:rotate-90" aria-hidden="true" />
          </summary>
          <div className="space-y-2 border-t border-slate-100 px-5 py-4 sm:px-6">
            <p className="text-sm text-slate-500">
              These classes have no students. Delete the ones that were created by mistake. A class that still has fees,
              results, attendance or exams cannot be deleted; merge or deactivate it instead.
            </p>
            {emptyClasses.map((c) => (
              <form
                key={c.id}
                action={deleteClassAction}
                className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
              >
                <input type="hidden" name="class_id" value={c.id} />
                <input type="hidden" name="return_to" value="/admin/classes" />
                <span className="flex flex-wrap items-center gap-2">
                  <Link className="font-semibold text-slate-900 hover:underline" href={`/admin/classes/${c.id}`}>
                    {c.name}
                  </Link>
                  <span className="text-xs capitalize text-slate-500">{c.level}</span>
                  {!c.active ? <Badge tone="slate">Inactive</Badge> : null}
                </span>
                <ConfirmSubmitButton
                  confirmMessage={`Delete "${c.name}"? This cannot be undone.`}
                  className={buttonClasses({ variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50 hover:text-red-700" })}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Delete
                </ConfirmSubmitButton>
              </form>
            ))}
          </div>
        </details>
      ) : null}

      {levels.map((level) => (
        <section key={level} className="space-y-3">
          <h2 className="text-sm font-semibold capitalize text-slate-900">{level}</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {classes
              .filter((c) => c.level === level)
              .map((c) => {
                const n = counts.get(c.id) ?? { current: 0, total: 0 };
                return (
                  <Link
                    key={c.id}
                    href={`/admin/classes/${c.id}`}
                    className={cn(
                      "group block rounded-2xl border bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-green-200 hover:shadow-lift",
                      c.active ? "border-slate-200/80" : "border-dashed border-slate-300 opacity-70"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                          <School className="h-[18px] w-[18px]" aria-hidden="true" />
                        </span>
                        <div className="font-semibold text-slate-900">{c.name}</div>
                      </div>
                      {!c.active ? (
                        <Badge tone="slate">Inactive</Badge>
                      ) : (
                        <ChevronRight
                          className="h-4 w-4 text-slate-300 transition group-hover:text-brand-green"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="mt-4 text-[1.65rem] font-bold leading-tight tracking-tight text-slate-900">{n.current}</div>
                    <div className="text-xs text-slate-500">
                      current student{n.current === 1 ? "" : "s"}
                      {n.total > n.current ? ` · ${n.total - n.current} past/other` : ""}
                    </div>
                  </Link>
                );
              })}
          </div>
        </section>
      ))}

      {!classes.length ? (
        <Card>
          <EmptyState
            icon={School}
            title="No classes yet"
            description="Create them under Finance → Fees → Classes."
            action={
              <ButtonLink href="/admin/finance/fees/classes" size="sm">
                Go to classes setup
              </ButtonLink>
            }
          />
        </Card>
      ) : null}
    </div>
  );
}
