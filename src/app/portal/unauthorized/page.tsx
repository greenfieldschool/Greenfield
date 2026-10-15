import Link from "next/link";
import { LogOut, ShieldAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { LoginFrame } from "../_components/portal-ui";

export default function PortalUnauthorizedPage() {
  return (
    <LoginFrame>
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gold-50 text-brand-gold-700">
        <ShieldAlert className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="mt-4 font-display text-3xl font-semibold text-slate-900">Access restricted</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        You&apos;re signed in, but this account doesn&apos;t have access to the parent &amp; student portal. If you
        think this is a mistake, please contact the school office.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <Link className={buttonClasses({ size: "lg", className: "flex-1" })} href="/">
          Go to website
        </Link>
        <form action="/portal/logout" method="post" className="flex-1">
          <button type="submit" className={buttonClasses({ variant: "secondary", size: "lg", className: "w-full" })}>
            <LogOut className="h-5 w-5" aria-hidden="true" />
            Sign out
          </button>
        </form>
      </div>
    </LoginFrame>
  );
}
