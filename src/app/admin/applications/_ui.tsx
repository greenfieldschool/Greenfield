import type { ReactNode } from "react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Field } from "@/components/ui/form-section";
import { cn } from "@/lib/cn";

// Local presentation helpers shared by the admissions application pages.

export const APPLICATION_STATUSES = ["lead", "submitted", "contacted", "visit_booked", "applied", "enrolled", "closed"] as const;

export function humanize(value: string) {
  const text = value.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function applicationStatusTone(status: string | null | undefined): BadgeTone {
  switch (status) {
    case "lead":
      return "blue";
    case "submitted":
    case "applied":
      return "gold";
    case "contacted":
    case "visit_booked":
      return "violet";
    case "enrolled":
      return "green";
    case "closed":
      return "slate";
    default:
      return "slate";
  }
}

export function ApplicationStatusBadge({ status }: { status: string | null | undefined }) {
  return (
    <Badge tone={applicationStatusTone(status)} dot>
      {status ? humanize(status) : "Unknown"}
    </Badge>
  );
}

/** ISO timestamp → "14 Oct 2026, 09:30" in Lagos time. */
export function formatDateTime(iso: unknown) {
  if (typeof iso !== "string" || !iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos"
  });
}

export function displayValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : value ? String(value) : "—";
}

export function TextField({
  label,
  name,
  defaultValue,
  type = "text",
  placeholder,
  hint,
  className,
  idPrefix = "app"
}: {
  label: string;
  name: string;
  defaultValue?: string;
  type?: "text" | "email" | "date" | "tel";
  placeholder?: string;
  hint?: ReactNode;
  className?: string;
  idPrefix?: string;
}) {
  const id = `${idPrefix}-${name}`;
  return (
    <Field label={label} htmlFor={id} hint={hint} className={className}>
      <input id={id} name={name} type={type} defaultValue={defaultValue} placeholder={placeholder} className="gf-input" />
    </Field>
  );
}

export function TextAreaField({
  label,
  name,
  defaultValue,
  rows = 4,
  className,
  idPrefix = "app"
}: {
  label: string;
  name: string;
  defaultValue?: string;
  rows?: number;
  className?: string;
  idPrefix?: string;
}) {
  const id = `${idPrefix}-${name}`;
  return (
    <Field label={label} htmlFor={id} className={className}>
      <textarea id={id} name={name} defaultValue={defaultValue} rows={rows} className="gf-input" />
    </Field>
  );
}

export function SelectField({
  label,
  name,
  defaultValue,
  options,
  className,
  idPrefix = "app"
}: {
  label: string;
  name: string;
  defaultValue?: string;
  options: Array<{ value: string; label: string }>;
  className?: string;
  idPrefix?: string;
}) {
  const id = `${idPrefix}-${name}`;
  return (
    <Field label={label} htmlFor={id} className={className}>
      <select id={id} name={name} defaultValue={defaultValue} className="gf-select">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function DetailList({
  items,
  className
}: {
  items: Array<{ label: string; value?: unknown; node?: ReactNode; wide?: boolean; multiline?: boolean }>;
  className?: string;
}) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4 sm:grid-cols-2", className)}>
      {items.map((item) => (
        <div key={item.label} className={cn("min-w-0", item.wide && "sm:col-span-2")}>
          <dt className="text-xs font-medium text-slate-500">{item.label}</dt>
          <dd
            className={cn(
              "mt-0.5 break-words text-sm font-medium text-slate-900",
              item.multiline && "whitespace-pre-wrap font-normal text-slate-700"
            )}
          >
            {item.node ?? displayValue(item.value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <h3 className="mb-4 text-sm font-semibold text-slate-900">{children}</h3>;
}
