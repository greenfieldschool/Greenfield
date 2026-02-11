import Link from "next/link";
import { getPublishedCareerJobs } from "@/lib/careers";

export const metadata = {
  title: "Careers — Greenfield School",
  description:
    "Join Greenfield School. View open roles and apply to help us build excellence in learning, character, and community."
};

export default async function CareersPage() {
  const careerJobs = await getPublishedCareerJobs();
  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:py-14">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          Careers
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Work with us at Greenfield School
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
          We’re building a school known for strong learning outcomes, great character, and a caring community.
          If you’re passionate about children and excellence, we’d love to hear from you.
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">What we value</div>
            <div className="mt-2 text-sm text-slate-700">Integrity, warmth, growth</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Environment</div>
            <div className="mt-2 text-sm text-slate-700">Supportive team & clear expectations</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Hiring</div>
            <div className="mt-2 text-sm text-slate-700">Fast review + interview + demo</div>
          </div>
        </div>
      </div>

      <div className="mt-10">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-xl font-semibold text-slate-900">Open roles</h2>
          <div className="text-sm text-slate-600">Updated regularly</div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {careerJobs.map((job) => (
            <Link
              key={job.slug}
              href={`/careers/${job.slug}`}
              className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:border-slate-300"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-base font-semibold text-slate-900 group-hover:underline">
                    {job.title}
                  </div>
                  <div className="mt-2 text-sm text-slate-600">{job.summary}</div>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  {job.location}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                  {job.employmentType}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-10 rounded-3xl border border-slate-200 bg-slate-50 p-6 sm:p-10">
          <h3 className="text-lg font-semibold text-slate-900">Don’t see your role?</h3>
          <p className="mt-2 max-w-3xl text-sm text-slate-600 sm:text-base">
            Send your CV and the role you’re interested in. We’ll keep your details and reach out when a
            suitable opening comes up.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a
              href="mailto:info@greenfieldschool.ng?subject=Career%20Interest%20—%20Greenfield%20School"
              className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 sm:w-auto"
            >
              Email your CV
            </a>
            <a
              href="https://wa.me/2349060010300"
              target="_blank"
              rel="noreferrer"
              className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-white/70 sm:w-auto"
            >
              WhatsApp us
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
