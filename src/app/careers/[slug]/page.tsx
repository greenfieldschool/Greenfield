import Link from "next/link";
import { notFound } from "next/navigation";
import {
  formatApplyCTA,
  getPublishedCareerJobBySlug,
  getPublishedCareerJobSlugs,
  getPublishedCareerJobs
} from "@/lib/careers";
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
    <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/careers" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
          ← Back to Careers
        </Link>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            {job.location}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
            {job.employmentType}
          </span>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{job.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">{job.summary}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          {applyHref ? (
            <a
              href={applyHref}
              target={applyHref.startsWith("http") ? "_blank" : undefined}
              rel={applyHref.startsWith("http") ? "noreferrer" : undefined}
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 sm:w-auto"
            >
              Apply now
            </a>
          ) : null}
          <a
            href="mailto:info@greenfieldschool.ng?subject=Careers%20Question%20—%20Greenfield%20School"
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 sm:w-auto"
          >
            Ask a question
          </a>
        </div>

        <div className="mt-10 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Key responsibilities</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {job.responsibilities.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-slate-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="text-lg font-semibold text-slate-900">Requirements</h2>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {job.requirements.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 flex-none rounded-full bg-slate-400" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10">
          <CareerApplyForm jobSlug={job.slug} jobTitle={job.title} />
        </div>

        <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reports to</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{job.reportsTo ?? "School leadership"}</div>
            </div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Last updated</div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{job.updatedAt}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
