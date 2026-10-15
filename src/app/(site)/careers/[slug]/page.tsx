import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Briefcase, CalendarDays, Check, MapPin, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import {
  formatApplyCTA,
  getPublishedCareerJobBySlug,
  getPublishedCareerJobSlugs,
  getPublishedCareerJobs
} from "@/lib/careers";
import { buttonClasses } from "@/components/ui/button";
import { PublicPageHero, PublicSection } from "@/components/ui/public-page";
import { CareerApplyForm } from "./apply-form";

type Props = {
  params: { slug: string };
};

export async function generateStaticParams() {
  const slugs = await getPublishedCareerJobSlugs();
  return slugs.map((slug) => ({ slug }));
}

export function generateMetadata({ params }: Props) {
  return getPublishedCareerJobs().then((jobs) => {
    const job = jobs.find((j) => j.slug === params.slug);
    if (!job) return { title: "Role not found — Greenfield School" };
    return {
      title: `${job.title} — Careers — Greenfield School`,
      description: job.summary
    };
  });
}

export default async function CareerJobPage({ params }: Props) {
  const job = await getPublishedCareerJobBySlug(params.slug);
  if (!job) notFound();

  const applyHref = formatApplyCTA(job);

  return (
    <div>
      <PublicPageHero eyebrow="Careers" title={job.title} description={job.summary}>
        {applyHref ? (
          <a
            href={applyHref}
            target={applyHref.startsWith("http") ? "_blank" : undefined}
            rel={applyHref.startsWith("http") ? "noreferrer" : undefined}
            className={buttonClasses({ variant: "gold", size: "lg", className: "w-full sm:w-auto" })}
          >
            Apply now
          </a>
        ) : null}
        <a
          href="mailto:info@greenfieldschool.ng?subject=Careers%20Question%20—%20Greenfield%20School"
          className={buttonClasses({ variant: "inverse", size: "lg", className: "w-full sm:w-auto" })}
        >
          Ask a question
        </a>
      </PublicPageHero>

      <PublicSection>
        <Link
          href="/careers"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-brand-green"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to careers
        </Link>

        <div className="mt-8 grid gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <div className="grid gap-6 md:grid-cols-2">
              <JobList title="Key responsibilities" items={job.responsibilities} />
              <JobList title="Requirements" items={job.requirements} />
            </div>

            <CareerApplyForm jobSlug={job.slug} jobTitle={job.title} />
          </div>

          <aside className="lg:sticky lg:top-24 lg:self-start">
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-card">
              <h2 className="font-display text-xl font-semibold text-slate-900">Role details</h2>
              <dl className="mt-5 space-y-5">
                <Detail icon={MapPin} label="Location" value={job.location} />
                <Detail icon={Briefcase} label="Employment type" value={job.employmentType} />
                <Detail icon={UserRound} label="Reports to" value={job.reportsTo ?? "School leadership"} />
                <Detail icon={CalendarDays} label="Last updated" value={job.updatedAt} />
              </dl>
            </div>
          </aside>
        </div>
      </PublicSection>
    </div>
  );
}

function JobList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-card">
      <h2 className="font-display text-xl font-semibold text-slate-900">{title}</h2>
      <ul className="mt-5 space-y-3 text-slate-700">
        {items.map((item) => (
          <li key={item} className="flex gap-3">
            <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-brand-green-50 text-brand-green-600">
              <Check className="h-3 w-3" aria-hidden="true" />
            </span>
            <span className="text-sm leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Detail({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-slate-500">{label}</dt>
        <dd className="mt-0.5 font-semibold text-slate-900">{value}</dd>
      </div>
    </div>
  );
}
