import Link from "next/link";

export default function StudentLifePage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">Student Life</h1>
        <p className="mt-4 text-slate-600">
          Clubs, sports, arts, leadership, and a strong sense of belonging.
        </p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Clubs & Societies</div>
          <p className="mt-2 text-sm text-slate-600">Student-led communities that build confidence.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Sports & Athletics</div>
          <p className="mt-2 text-sm text-slate-600">Teamwork, discipline, and healthy competition.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Arts & Culture</div>
          <p className="mt-2 text-sm text-slate-600">Creativity through music, drama, and visual arts.</p>
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
