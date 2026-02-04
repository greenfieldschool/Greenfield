import { ApplyWizard } from "./ui";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

export default function ApplyPage({ searchParams }: Props) {
  const t = typeof searchParams?.t === "string" ? searchParams.t : "";

  return (
    <div className="mx-auto max-w-4xl px-6 py-10 sm:py-14">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
          Creche • Primary • Secondary
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
          Admissions application
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">
          Start with quick details (under a minute) so we can contact you. You can complete the full
          application now or resume later.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time</div>
            <div className="mt-2 text-sm font-semibold text-slate-900">1 min to start</div>
            <div className="mt-1 text-sm text-slate-600">5–10 min to finish</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">What you’ll need</div>
            <div className="mt-2 text-sm text-slate-700">Parent phone number</div>
            <div className="mt-1 text-sm text-slate-700">Child details + class seeking</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Save & resume</div>
            <div className="mt-2 text-sm text-slate-700">Copy your resume link</div>
            <div className="mt-1 text-sm text-slate-700">Continue later anytime</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <a
            href="#application"
            className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 sm:w-auto"
          >
            Start application
          </a>
          <a
            href="/contact"
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 sm:w-auto"
          >
            Prefer to talk first? Contact us
          </a>
        </div>
      </div>

      <div id="application" className="mt-8 scroll-mt-6 sm:mt-10">
        <ApplyWizard initialToken={t} />
      </div>
    </div>
  );
}
