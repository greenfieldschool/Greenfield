import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, UserX, type LucideIcon } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/cn";
import { FieldBackdrop } from "@/components/three/field-backdrop";

// Portal-local primitives. The portal uses the serif display face for page titles (friendlier
// for pupils and parents), so it has its own header rather than the admin-styled PageHeader.

export function PortalPageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
  className
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {back ? (
          <Link
            href={back.href}
            className="-ml-1 mb-3 inline-flex min-h-[40px] items-center gap-1 rounded-lg px-1 text-sm font-medium text-slate-500 transition hover:text-brand-green"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        {eyebrow ? <div className="text-sm font-medium text-brand-green-600">{eyebrow}</div> : null}
        <h1 className="mt-1 font-display text-3xl font-semibold text-slate-900">{title}</h1>
        {description ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

// Small label/value pair used on detail cards.
export function InfoItem({ label, children, className }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-slate-50 px-4 py-3", className)}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-semibold text-slate-900">{children}</div>
    </div>
  );
}

// Full-screen frame for the login pages: deep green backdrop, logo, centred card.
export function LoginFrame({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-brand-green-950">
      <FieldBackdrop />
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-gold/15 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-green-500/20 blur-3xl"
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-4 py-12">
        <Link href="/" aria-label="Greenfield School home" className="mb-8">
          <Logo inverted subtitle="Parent & student portal" />
        </Link>
        <div className="w-full animate-fade-up rounded-3xl bg-white p-6 shadow-2xl sm:p-8">{children}</div>
        {footer ? <div className="mt-6 text-center text-sm text-brand-green-100">{footer}</div> : null}
      </div>
    </div>
  );
}

// ---- Loading skeletons ----

export function SkeletonBar({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-slate-200/80", className)} />;
}

export function SkeletonHeader() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <SkeletonBar className="h-4 w-24" />
      <SkeletonBar className="h-8 w-56" />
      <SkeletonBar className="h-4 w-72 max-w-full" />
    </div>
  );
}

export function SkeletonCard({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-slate-200/80 bg-white shadow-card", className)} aria-hidden="true">
      <div className="border-b border-slate-100 px-5 py-4 sm:px-6">
        <SkeletonBar className="h-5 w-40" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-5 py-4 sm:px-6">
            <SkeletonBar className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-2">
              <SkeletonBar className="h-4 w-1/2" />
              <SkeletonBar className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonStats({ count = 3 }: { count?: number }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", count >= 4 ? "xl:grid-cols-4" : "lg:grid-cols-3")} aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card">
          <SkeletonBar className="h-4 w-24" />
          <SkeletonBar className="mt-3 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton({ stats = 0, cards = 1, rows = 3 }: { stats?: number; cards?: number; rows?: number }) {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <SkeletonHeader />
      {stats ? <SkeletonStats count={stats} /> : null}
      {Array.from({ length: cards }).map((_, i) => (
        <SkeletonCard key={i} rows={rows} />
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}

// Row of link "pills" (child switcher, term switcher). Big tap targets for phones.
export function PillLinks({
  label,
  items,
  className
}: {
  label: string;
  items: Array<{ key: string; href: string; label: ReactNode; active: boolean }>;
  className?: string;
}) {
  return (
    <nav aria-label={label} className={cn("flex gap-2 overflow-x-auto pb-1", className)}>
      {items.map((it) => (
        <Link
          key={it.key}
          href={it.href}
          aria-current={it.active ? "page" : undefined}
          className={cn(
            "inline-flex min-h-[40px] shrink-0 items-center rounded-full border px-4 text-sm font-semibold transition",
            it.active
              ? "border-brand-green bg-brand-green text-white shadow-sm"
              : "border-slate-200 bg-white text-slate-700 hover:border-brand-green-200 hover:bg-brand-green-50/50"
          )}
        >
          {it.label}
        </Link>
      ))}
    </nav>
  );
}

// Maps common status words to a Badge tone and a friendly label.
export function statusBadge(status: string | null | undefined): { tone: "green" | "gold" | "red" | "blue" | "slate"; label: string } {
  const s = String(status ?? "").trim().toLowerCase();
  const label = s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " ") : "Unknown";
  if (["active", "paid", "present", "resolved", "closed", "submitted", "completed", "approved", "open"].includes(s))
    return { tone: "green", label };
  if (["pending", "draft", "late", "partial", "partially_paid", "in_progress", "issued", "unpaid", "excused"].includes(s))
    return { tone: "gold", label };
  if (["overdue", "absent", "withdrawn", "void", "failed", "cancelled", "suspended", "expired"].includes(s))
    return { tone: "red", label };
  if (["inactive", "archived"].includes(s)) return { tone: "slate", label };
  return { tone: "blue", label };
}

// Circular score visual (pure SVG). `percent` is clamped to 0–100.
export function ScoreRing({
  percent,
  size = 168,
  stroke = 14,
  label,
  className
}: {
  percent: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  className?: string;
}) {
  const p = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = p >= 70 ? "#2f8560" : p >= 50 ? "#D4A017" : "#e11d48";
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-4xl font-bold tracking-tight text-slate-900">{Math.round(p)}%</span>
        {label ? <span className="mt-0.5 text-xs font-medium text-slate-500">{label}</span> : null}
      </div>
    </div>
  );
}

// Standard explanations for portal accounts that can't see a page yet.
export const portalMessages = {
  notPortal: "This page is for students and parents. Please sign in with a student or parent account.",
  noGuardian: "Your account isn't linked to a parent record yet — please contact the school office.",
  noChildren: "No children are linked to your account yet — please contact the school office.",
  noStudent: "Your account isn't linked to a student record yet — please ask your class teacher or the school office."
} as const;

// Full page "can't show this" state: page header + a card with an EmptyState.
export function PortalNotice({
  title,
  heading = "Nothing to show yet",
  message,
  icon = UserX,
  back,
  action
}: {
  title: ReactNode;
  heading?: string;
  message: ReactNode;
  icon?: LucideIcon;
  back?: { href: string; label: string };
  action?: ReactNode;
}) {
  return (
    <div className="space-y-6">
      <PortalPageHeader title={title} back={back} />
      <Card>
        <EmptyState icon={icon} title={heading} description={message} action={action} />
      </Card>
    </div>
  );
}
