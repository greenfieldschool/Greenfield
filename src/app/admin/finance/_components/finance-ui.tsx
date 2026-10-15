import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

// Local presentation helpers shared by the finance pages (not routable: folder starts with "_").

const statusTones: Record<string, BadgeTone> = {
  paid: "green",
  posted: "green",
  success: "green",
  successful: "green",
  created: "blue",
  completed: "green",
  active: "green",
  partially_paid: "gold",
  issued: "gold",
  pending: "gold",
  draft: "slate",
  void: "slate",
  voided: "slate",
  inactive: "slate",
  cancelled: "slate",
  overdue: "red",
  failed: "red"
};

export function statusLabel(status: string) {
  const s = status.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Status pill for invoices/payments. Void keeps its line-through so it reads as cancelled.
export function FinanceStatusBadge({ status, className }: { status: string | null | undefined; className?: string }) {
  const key = String(status ?? "").toLowerCase();
  if (!key) return <span className="text-slate-400">—</span>;
  const isVoid = key === "void" || key === "voided";
  return (
    <Badge tone={statusTones[key] ?? "slate"} className={className}>
      <span className={cn(isVoid && "line-through")}>{statusLabel(key)}</span>
    </Badge>
  );
}

// Format a YYYY-MM-DD (or ISO) string as "14 Oct 2026". Falls back to the raw value if unparsable.
export function fmtDate(value: string | null | undefined): string {
  if (!value) return "—";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: dateOnly ? "UTC" : "Africa/Lagos"
  });
}

export function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos"
  });
}

// Right-aligned, tabular money cell content.
export function Money({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("whitespace-nowrap tabular-nums", className)}>{children}</span>;
}

// A label/value row used in totals blocks and summary lists.
export function SummaryRow({
  label,
  value,
  emphasis,
  className
}: {
  label: ReactNode;
  value: ReactNode;
  emphasis?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-2 text-sm",
        emphasis ? "font-semibold text-slate-900" : "text-slate-600",
        className
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

// Money with the currency shown as ₦ for NGN (or the code otherwise). Presentation only.
export function fmtMoney(amount: number | string | null | undefined, currency?: string | null): string {
  const n = Number(amount ?? 0);
  const cur = (currency ?? "NGN").toUpperCase();
  const body = n.toLocaleString("en-NG");
  if (cur === "NGN") return n < 0 ? `-₦${body.replace("-", "")}` : `₦${body}`;
  return `${cur} ${body}`;
}

// "₦" for NGN, otherwise the currency code followed by a space.
export function currencyPrefix(currency: string | null | undefined): string {
  const cur = (currency ?? "NGN").toUpperCase();
  return cur === "NGN" ? "₦" : `${cur} `;
}
