import { safeRedirect } from "@/lib/route-access";
import Link from "next/link";
import { ArrowRight, GraduationCap, Users, type LucideIcon } from "lucide-react";
import { LoginFrame } from "../_components/portal-ui";

function ChoiceCard({
  href,
  icon: Icon,
  title,
  description,
  tone
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  description: string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-brand-green-200 hover:shadow-lift focus-visible:ring-4 focus-visible:ring-brand-green-500/20"
    >
      <span className={`inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tone}`}>
        <Icon className="h-7 w-7" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-sm text-slate-500">{description}</span>
      </span>
      <ArrowRight
        className="h-5 w-5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-green"
        aria-hidden="true"
      />
    </Link>
  );
}

export default function PortalLoginPage({
  searchParams
}: {
  searchParams: { redirectTo?: string };
}) {
  const redirectTo = safeRedirect(searchParams.redirectTo, "portal");
  const qs = `?redirectTo=${encodeURIComponent(redirectTo)}`;

  return (
    <LoginFrame footer="Having trouble signing in? Contact the school office.">
      <h1 className="font-display text-3xl font-semibold text-slate-900">Welcome</h1>
      <p className="mt-1.5 text-sm text-slate-600">Who is signing in today?</p>

      <div className="mt-6 grid gap-3">
        <ChoiceCard
          href={`/portal/login/student${qs}`}
          icon={GraduationCap}
          title="I'm a student"
          description="Sign in with your admission number"
          tone="bg-brand-gold-50 text-brand-gold-700"
        />
        <ChoiceCard
          href={`/portal/login/guardian${qs}`}
          icon={Users}
          title="I'm a parent"
          description="Sign in with your email address"
          tone="bg-brand-green-50 text-brand-green-600"
        />
      </div>
    </LoginFrame>
  );
}
