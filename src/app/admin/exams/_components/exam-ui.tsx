import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

// Small presentation helpers shared by the exam admin pages.

const sessionStatusTones: Record<string, BadgeTone> = {
  active: "green",
  draft: "gold",
  closed: "slate"
};

export function SessionStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={sessionStatusTones[status] ?? "slate"} dot className="capitalize">
      {status}
    </Badge>
  );
}

const attemptStatusTones: Record<string, BadgeTone> = {
  in_progress: "blue",
  submitted: "green",
  graded: "violet",
  locked: "red",
  expired: "slate"
};

export function AttemptStatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={attemptStatusTones[status] ?? "slate"} className="capitalize">
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

// Numbered pagination for list pages. `suffix` is appended after `?page=N` (e.g. "&q=foo").
export function Pagination({
  basePath,
  suffix,
  page,
  pageSize,
  totalCount,
  hasNext
}: {
  basePath: string;
  suffix: string;
  page: number;
  pageSize: number;
  totalCount: number;
  hasNext: boolean;
}) {
  if (totalCount <= pageSize) return null;
  const offset = (page - 1) * pageSize;
  const pages = Math.ceil(totalCount / pageSize);
  const href = (p: number) => `${basePath}?page=${p}${suffix}`;
  const navBtn =
    "inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50";
  const navDisabled =
    "inline-flex h-9 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-400";

  return (
    <nav
      aria-label="Pagination"
      className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
    >
      <p className="text-sm text-slate-600">
        Showing <span className="font-semibold text-slate-900">{offset + 1}</span> to{" "}
        <span className="font-semibold text-slate-900">{Math.min(offset + pageSize, totalCount)}</span> of{" "}
        <span className="font-semibold text-slate-900">{totalCount}</span> results
      </p>
      <div className="flex items-center justify-between gap-1 sm:justify-end">
        {page > 1 ? (
          <Link href={href(page - 1)} className={navBtn}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </Link>
        ) : (
          <span className={navDisabled}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            Previous
          </span>
        )}
        <div className="hidden items-center gap-1 sm:flex">
          {Array.from({ length: pages }).map((_, i) => {
            const p = i + 1;
            const isCurrent = p === page;
            return (
              <Link
                key={p}
                href={href(p)}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-xl border text-sm font-semibold transition",
                  isCurrent
                    ? "border-brand-green bg-brand-green text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                )}
              >
                {p}
              </Link>
            );
          })}
        </div>
        {hasNext ? (
          <Link href={href(page + 1)} className={navBtn}>
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        ) : (
          <span className={navDisabled}>
            Next
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
      </div>
    </nav>
  );
}
