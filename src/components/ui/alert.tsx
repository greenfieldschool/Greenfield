import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type AlertTone = "info" | "success" | "warning" | "danger";

const styles: Record<AlertTone, { box: string; icon: typeof Info }> = {
  info: { box: "border-sky-200 bg-sky-50 text-sky-900", icon: Info },
  success: { box: "border-brand-green-200 bg-brand-green-50 text-brand-green-900", icon: CheckCircle2 },
  warning: { box: "border-brand-gold-200 bg-brand-gold-50 text-brand-gold-900", icon: AlertTriangle },
  danger: { box: "border-red-200 bg-red-50 text-red-900", icon: XCircle }
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className
}: {
  tone?: AlertTone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const Icon = styles[tone].icon;
  return (
    <div className={cn("flex gap-3 rounded-2xl border px-4 py-3.5 text-sm", styles[tone].box, className)} role={tone === "danger" ? "alert" : undefined}>
      <Icon className="mt-0.5 h-[18px] w-[18px] shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title ? <div className="font-semibold">{title}</div> : null}
        {children ? <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
