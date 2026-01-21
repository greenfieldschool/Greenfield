import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">About Greenfield</h1>
        <p className="mt-4 text-slate-600">
          Greenfield School is built on academic excellence, character development, and a supportive
          community.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Mission</div>
          <p className="mt-2 text-sm text-slate-600">
            To develop confident learners with strong values and global readiness.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Values</div>
          <p className="mt-2 text-sm text-slate-600">
            Integrity, curiosity, excellence, service, and respect.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Community</div>
          <p className="mt-2 text-sm text-slate-600">
            A safe, inclusive environment where students thrive.
          </p>
        </div>
      </div>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/academics"
          className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
        >
          Explore Academics
        </Link>
        <Link
          href="/admissions"
          className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
        >
          Admissions
        </Link>
      </div>
    </div>
  );
}
