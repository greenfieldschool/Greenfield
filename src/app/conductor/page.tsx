import Link from "next/link";
import { ArrowRight, CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";

export default async function ConductorHomePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Conductor"
        title="Session dashboard"
        description="View assigned sessions and unlock students when needed."
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/conductor/sessions"
          className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-brand-green-200 hover:shadow-lift"
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
            <CalendarClock className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="mt-4 text-base font-semibold text-slate-900">My sessions</span>
          <span className="mt-1 text-sm text-slate-600">Open a session to monitor attempts.</span>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-brand-green-700">
            Open
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </Link>
      </div>
    </div>
  );
}
