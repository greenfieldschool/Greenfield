import { redirect } from "next/navigation";
import { Badge, type BadgeTone } from "@/components/ui/badge";

// Shared bits for the welfare pages (local to this folder).

export function severityTone(severity: number): BadgeTone {
  if (severity >= 4) return "red";
  if (severity === 3) return "gold";
  if (severity === 2) return "blue";
  return "slate";
}

export function SeverityBadge({ severity }: { severity: number }) {
  return (
    <Badge tone={severityTone(severity)} className="tabular-nums">
      <span className="sr-only">Severity </span>
      {severity}/5
    </Badge>
  );
}

// Pill-shaped status toggle button classes (used with SubmitButton's className).
export function pillButtonClasses(tone: "green" | "gold" | "slate") {
  const tones = {
    green: "bg-brand-green-50 text-brand-green-700 ring-brand-green-200/70 hover:bg-brand-green-100",
    gold: "bg-brand-gold-50 text-brand-gold-800 ring-brand-gold-200/70 hover:bg-brand-gold-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200 hover:bg-slate-200"
  } as const;
  return `inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset transition disabled:opacity-60 ${tones[tone]}`;
}

export const deleteLinkClasses =
  "inline-flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60";

export function shortDate(value: string | null | undefined) {
  return value ? String(value).slice(0, 10) : "—";
}

// Redirect back to a welfare page with a toast (used by the pages' server actions).
export function welfareBack(path: string, message: string, type: "success" | "error" = "success"): never {
  redirect(`${path}?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}
