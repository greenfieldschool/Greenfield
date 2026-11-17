import Link from "next/link";
import { ArrowUpRight, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS } from "@/lib/student-deactivation";
import type { PossibleDuplicate } from "@/lib/pupil-intake";
import { cn } from "@/lib/cn";

function formatDob(iso: string | null) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[(m ?? 1) - 1]} ${y}`;
}

/**
 * "Might already be at the school": pupils who look like the one being added, with why each matched and a
 * one-click way to open them. Used on Add a pupil (live) and on an application before approving.
 */
export function PossibleDuplicates({
  rows,
  strongFrom = 50,
  className,
  title = "Might already be at the school"
}: {
  rows: PossibleDuplicate[];
  strongFrom?: number;
  className?: string;
  title?: string;
}) {
  if (!rows.length) return null;
  const strong = rows.some((r) => r.strength >= strongFrom);
  return (
    <section
      className={cn(
        "rounded-2xl border px-4 py-3.5 text-sm",
        strong ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50",
        className
      )}
      aria-live="polite"
      aria-label={title}
    >
      <div className="flex items-center gap-2 font-semibold text-slate-900">
        <Users className={cn("h-4 w-4", strong ? "text-amber-700" : "text-slate-500")} aria-hidden="true" />
        {title}
      </div>
      <p className="mt-0.5 text-slate-600">
        {strong
          ? "If one of these is the same child, open their record instead of adding them again."
          : "Probably a brother, sister or namesake, but have a quick look."}
      </p>
      <ul className="mt-2.5 space-y-2">
        {rows.map((d) => (
          <li key={d.student_id} className="flex flex-col gap-2 rounded-xl bg-white px-3 py-2.5 ring-1 ring-slate-200 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="font-medium text-slate-900">
                {d.full_name}
                {d.admission_number ? <span className="ml-2 font-mono text-xs text-slate-600">{d.admission_number}</span> : null}
              </div>
              <div className="text-xs text-slate-500">
                {[d.class_name ?? "No class", STATUS_LABELS[d.status] ?? d.status, d.date_of_birth ? `born ${formatDob(d.date_of_birth)}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {d.reasons.map((r) => (
                  <Badge key={r} tone={d.strength >= strongFrom ? "gold" : "slate"}>
                    {r}
                  </Badge>
                ))}
              </div>
            </div>
            <Link
              href={`/admin/students/${d.student_id}`}
              target="_blank"
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-brand-green-700 ring-1 ring-brand-green-200 hover:bg-brand-green-50"
            >
              Open this record
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">(opens in a new tab)</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
