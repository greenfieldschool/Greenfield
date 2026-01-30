import Link from "next/link";

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">About Greenfield</h1>
        <p className="mt-4 text-slate-600">
          Greenfield School serves families across Creche, Primary, and Secondary with a Nigerian + British
          blended curriculum, strong values, and outstanding care.
        </p>
      </div>

      <div className="mt-10 grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Mission</div>
          <p className="mt-2 text-sm text-slate-600">
            To develop confident learners with strong values and global readiness from early years to
            secondary school.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Values</div>
          <p className="mt-2 text-sm text-slate-600">
            Integrity, curiosity, excellence, service, and respect.
          </p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Our school</div>
          <p className="mt-2 text-sm text-slate-600">
            Creche (0–4), Primary (5–11), and Secondary (12–16) in a safe, inclusive environment.
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
