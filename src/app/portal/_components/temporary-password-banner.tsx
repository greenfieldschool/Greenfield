"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound } from "lucide-react";

/** Shown while someone is still using the temporary password the school gave them. */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function lastDay(iso: string | null) {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", day: "numeric", month: "numeric" }).formatToParts(new Date(Date.parse(iso) - 1000));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return `${get("day")} ${MONTHS[get("month") - 1]}`;
}

export function TemporaryPasswordBanner({ until = null }: { until?: string | null }) {
  const pathname = usePathname();
  if (pathname?.startsWith("/portal/change-password")) return null;
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-brand-gold-50 px-4 py-3 text-sm ring-1 ring-brand-gold-200 sm:flex-row sm:items-center print:hidden">
      <KeyRound className="hidden h-5 w-5 shrink-0 text-brand-gold-700 sm:block" aria-hidden="true" />
      <p className="flex-1 text-slate-800">
        <strong>You&apos;re using the password the school gave you.</strong> Choose your own so only you know it
        {lastDay(until) ? <>; after {lastDay(until)} you&apos;ll have to</> : null}.
      </p>
      <Link
        href="/portal/change-password"
        className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-brand-green px-4 font-semibold text-white hover:bg-brand-green-700"
      >
        Choose my password
      </Link>
    </div>
  );
}
