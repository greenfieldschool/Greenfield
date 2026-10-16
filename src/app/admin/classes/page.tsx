import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/fetch-all";
import { ChevronRight, School, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
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

  // Classes with the same name in the same level (ignoring case, spaces and dashes), e.g. "JSS 1" and "JSS1".
  const byKey = new Map<string, ClassRow[]>();
  for (const c of classes) {
    const key = `${c.level}|${classNameKey(c.name)}`;
    byKey.set(key, [...(byKey.get(key) ?? []), c]);
  }
  const duplicateGroups = Array.from(byKey.values()).filter((g) => g.length > 1);

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
        <Alert tone="warning" title="Possible duplicate classes">
          <ul className="mt-1 space-y-1">
            {duplicateGroups.map((group) => (
              <li key={group[0].id}>
                {group.map((c, i) => (
                  <span key={c.id}>
                    {i > 0 ? " · " : ""}
                    <Link className="font-semibold capitalize hover:underline" href={`/admin/classes/${c.id}`}>
                      {c.level} - {c.name}
                    </Link>{" "}
                    ({counts.get(c.id)?.total ?? 0} student{(counts.get(c.id)?.total ?? 0) === 1 ? "" : "s"})
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <p className="mt-2">Open the one you don&apos;t want and use &quot;Merge into&quot; at the bottom of the page.</p>
        </Alert>
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
