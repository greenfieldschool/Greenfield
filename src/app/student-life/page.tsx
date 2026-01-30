import Link from "next/link";

export default function StudentLifePage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">Student Life</h1>
        <p className="mt-4 text-slate-600">
          A caring environment for Creche, a vibrant experience for Primary, and a purposeful community
          for Secondary — with clubs, sports, arts, and leadership.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Creche care & routines</div>
          <p className="mt-2 text-sm text-slate-600">
            Warm supervision, play, and early learning routines that support healthy development.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Primary clubs & enrichment</div>
          <p className="mt-2 text-sm text-slate-600">
            Confidence-building clubs, creativity, sports, and a strong reading culture.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Secondary leadership</div>
          <p className="mt-2 text-sm text-slate-600">
            Societies, mentoring, responsibility, and healthy competition that builds character.
          </p>
        </div>
      </div>

      <div className="mt-10">
        <Link
          href="/events"
          className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
        >
          View upcoming events
        </Link>
      </div>
    </div>
  );
}
