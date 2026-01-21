import Link from "next/link";

export default function AcademicsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">Academics</h1>
        <p className="mt-4 text-slate-600">
          Rigorous learning pathways, supportive teaching, and a balanced approach that blends STEM,
          humanities, and the arts.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Curriculum</div>
          <p className="mt-2 text-sm text-slate-600">
            Clear progressions, strong foundations, and high expectations.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Learning Support</div>
          <p className="mt-2 text-sm text-slate-600">
            Personalized support to help every student grow with confidence.
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
