import Link from "next/link";

export default function AcademicsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">Academics</h1>
        <p className="mt-4 text-slate-600">
          A Nigerian + British blended curriculum across Creche, Primary, and Secondary — built on strong
          foundations, high expectations, and supportive teaching.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Creche (0–4)</div>
          <p className="mt-2 text-sm text-slate-600">
            Warm, safe care with early learning routines that build confidence, language, and social
            development.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Primary (5–11)</div>
          <p className="mt-2 text-sm text-slate-600">
            Strong literacy and numeracy foundations, curiosity-driven learning, and character formation.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Secondary (12–16)</div>
          <p className="mt-2 text-sm text-slate-600">
            Subject mastery, critical thinking, leadership, and structured preparation for the next stage.
          </p>
        </div>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Curriculum</div>
          <p className="mt-2 text-sm text-slate-600">
            A blended Nigerian + British approach with clear progressions and strong foundations.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Learning Support</div>
          <p className="mt-2 text-sm text-slate-600">
            Personalized support to help every learner grow with confidence at every stage.
          </p>
        </div>
      </div>

      <div className="mt-10">
        <Link
          href="/contact"
          className="inline-flex items-center justify-center rounded-xl bg-brand-gold px-5 py-3 text-sm font-semibold text-slate-900 hover:brightness-95"
        >
          Request information
        </Link>
      </div>
    </div>
  );
}
