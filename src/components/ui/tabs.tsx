import Link from "next/link";
import { cn } from "@/lib/cn";

// Link-based tabs (each tab is a URL), for sub-sections and filters without client state.
export function LinkTabs({
  tabs,
  active,
  className
}: {
  tabs: Array<{ href: string; label: string; key: string; count?: number }>;
  active: string;
  className?: string;
}) {
  return (
    <nav className={cn("-mb-px flex gap-1 overflow-x-auto border-b border-slate-200", className)} aria-label="Tabs">
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition",
              isActive
                ? "border-brand-green text-brand-green"
                : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800"
            )}
          >
            {t.label}
            {typeof t.count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                  isActive ? "bg-brand-green-50 text-brand-green-700" : "bg-slate-100 text-slate-600"
                )}
              >
                {t.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
