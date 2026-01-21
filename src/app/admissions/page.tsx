import Link from "next/link";

function Step({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
    </div>
  );
}

export default function AdmissionsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">Admissions</h1>
        <p className="mt-4 text-slate-600">
          A clear, supportive process designed to help families make confident decisions.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        <Step title="1) Request information" text="Get program details and admissions guidance." />
        <Step title="2) Visit campus" text="Tour the school and meet the team." />
        <Step title="3) Apply" text="Submit your application with our support." />
      </div>

      <div className="mt-10 rounded-3xl border border-slate-200 bg-white p-8">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="text-sm font-semibold text-slate-900">What you’ll need</div>
            <ul className="mt-3 list-disc pl-5 text-sm text-slate-600">
              <li>Student information</li>
              <li>Previous records (if available)</li>
              <li>Parent/guardian contact details</li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-900">Next step</div>
            <p className="mt-3 text-sm text-slate-600">
              Start by requesting information or booking a visit.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-xl bg-brand-gold px-5 py-3 text-sm font-semibold text-slate-900 hover:brightness-95"
              >
                Book a Visit
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              >
                Request Info
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
