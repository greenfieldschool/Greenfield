"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KeyRound } from "lucide-react";

/** Shown while someone is still using the temporary password the school gave them. */
export function TemporaryPasswordBanner() {
  const pathname = usePathname();
  if (pathname?.startsWith("/portal/change-password")) return null;
  return (
    <div className="mb-5 flex flex-col gap-3 rounded-2xl bg-brand-gold-50 px-4 py-3 text-sm ring-1 ring-brand-gold-200 sm:flex-row sm:items-center print:hidden">
      <KeyRound className="hidden h-5 w-5 shrink-0 text-brand-gold-700 sm:block" aria-hidden="true" />
      <p className="flex-1 text-slate-800">
        <strong>You&apos;re using the password the school gave you.</strong> Choose your own so only you know it.
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
