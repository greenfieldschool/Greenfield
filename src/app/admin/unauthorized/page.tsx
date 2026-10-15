import { ShieldAlert } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { ButtonLink, buttonClasses } from "@/components/ui/button";

export default function AdminUnauthorizedPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-16">
      <Logo subtitle="Staff dashboard" />
      <div className="mt-8 w-full max-w-lg rounded-2xl border border-slate-200/80 bg-white p-6 text-center shadow-card sm:p-8">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold-50 text-brand-gold-700">
          <ShieldAlert className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-brand-green-600">Admin</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Access restricted</h1>
        <p className="mt-2 text-sm text-slate-600">
          Your account is signed in, but it doesn’t have permission to access the admin dashboard.
        </p>
        <div className="mt-6 flex flex-col-reverse justify-center gap-3 sm:flex-row">
          <form action="/admin/logout" method="post">
            <button type="submit" className={buttonClasses({ variant: "secondary", className: "w-full sm:w-auto" })}>
              Sign out
            </button>
          </form>
          <ButtonLink href="/" variant="primary">
            Go to website
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
