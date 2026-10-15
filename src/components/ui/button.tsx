import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "gold" | "danger" | "inverse";
export type ButtonSize = "sm" | "md" | "lg";

const base =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition " +
  "focus-visible:outline-none focus-visible:ring-4 disabled:pointer-events-none disabled:opacity-60 active:translate-y-px";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-green text-white shadow-sm hover:bg-brand-green-800 focus-visible:ring-brand-green-500/25",
  secondary:
    "border border-slate-300 bg-white text-slate-800 shadow-sm hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-slate-400/20",
  ghost: "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400/20",
  gold: "bg-brand-gold text-brand-green-950 shadow-sm hover:bg-brand-gold-400 focus-visible:ring-brand-gold/30",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-500/25",
  inverse: "border border-white/25 bg-white/10 text-white backdrop-blur hover:bg-white/20 focus-visible:ring-white/30"
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-9 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-sm"
};

export function buttonClasses({
  variant = "primary",
  size = "md",
  className
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button className={buttonClasses({ variant, size, className })} {...props} />;
}

export function ButtonLink({
  href,
  variant,
  size,
  className,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, "className"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses({ variant, size, className })} {...props}>
      {children}
    </Link>
  );
}
