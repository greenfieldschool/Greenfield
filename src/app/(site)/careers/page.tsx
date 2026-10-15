import Link from "next/link";
import { ArrowRight, Briefcase, Clock, HeartHandshake, MapPin, Users } from "lucide-react";
import { getPublishedCareerJobs } from "@/lib/careers";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PublicPageHero, PublicSection, SectionHeading } from "@/components/ui/public-page";

export const metadata = {
  title: "Careers — Greenfield School",
  description:
    "Join Greenfield School. View open roles and apply to help us build excellence in learning and character."
};

const highlights = [
  { icon: HeartHandshake, label: "What we value", value: "Integrity, warmth, growth" },
  { icon: Users, label: "Environment", value: "Supportive team & clear expectations" },
  { icon: Clock, label: "Hiring", value: "Fast review + interview + demo" }
];

export default async function CareersPage() {
  const careerJobs = await getPublishedCareerJobs();
  return (
    <div>
      <PublicPageHero
        eyebrow="Careers"
        title="Work with us at Greenfield School"
        description="We’re building a school known for strong learning outcomes, great character, and a caring community. If you’re passionate about children and excellence, we’d love to hear from you."
      >
        <a href="#open-roles" className={buttonClasses({ variant: "gold", size: "lg" })}>
          View open roles
        </a>
      </PublicPageHero>

      <section className="relative z-10 mx-auto -mt-10 max-w-7xl px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {highlights.map((h) => (
            <div key={h.label} className="flex items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-6 shadow-lift">
              <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                <h.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="text-xs font-medium text-slate-500">{h.label}</div>
                <div className="mt-1 font-semibold text-slate-900">{h.value}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <PublicSection>
        <div id="open-roles" className="flex scroll-mt-24 flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <SectionHeading eyebrow="Join the team" title="Open roles" />
          <div className="text-sm text-slate-500">Updated regularly</div>
        </div>

        {careerJobs.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-slate-200/80 bg-white shadow-card">
            <EmptyState icon={Briefcase} title="No open roles right now" description="Check back soon, or send us your CV below." />
          </div>
        ) : (
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            {careerJobs.map((job) => (
              <Link
                key={job.slug}
                href={`/careers/${job.slug}`}
                className="group flex flex-col rounded-3xl border border-slate-200/80 bg-white p-7 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <h3 className="font-display text-2xl font-semibold text-slate-900">{job.title}</h3>
                <p className="mt-2 flex-1 leading-relaxed text-slate-600">{job.summary}</p>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-green-50 px-3 py-1 text-xs font-semibold text-brand-green-700">
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      {job.location}
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold-50 px-3 py-1 text-xs font-semibold text-brand-gold-800">
                      <Briefcase className="h-3.5 w-3.5" aria-hidden="true" />
                      {job.employmentType}
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green">
                    View role
                    <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="mt-16 flex flex-col items-start justify-between gap-8 rounded-[2rem] bg-brand-green-900 p-8 text-white sm:p-12 lg:flex-row lg:items-center">
          <div className="max-w-2xl">
            <h3 className="font-display text-3xl font-semibold">Don’t see your role?</h3>
            <p className="mt-3 text-brand-green-100">
              Send your CV and the role you’re interested in. We’ll keep your details and reach out when a suitable
              opening comes up.
            </p>
          </div>
          <div className="flex w-full flex-wrap gap-3 sm:w-auto">
            <a
              href="mailto:info@greenfieldschool.ng?subject=Career%20Interest%20—%20Greenfield%20School"
              className={buttonClasses({ variant: "gold", size: "lg", className: "w-full sm:w-auto" })}
            >
              Email your CV
            </a>
            <a
              href="https://wa.me/2349060010300"
              target="_blank"
              rel="noreferrer"
              className={buttonClasses({ variant: "inverse", size: "lg", className: "w-full sm:w-auto" })}
            >
              WhatsApp us
            </a>
          </div>
        </div>
      </PublicSection>
    </div>
  );
}
