import Link from "next/link";

export default async function AdminExamsPage() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Exams</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Exam portal</h1>
        <p className="mt-2 text-sm text-slate-600">Create tests, schedule sessions, and review attempts.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/admin/exams/tests"
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:bg-slate-50"
        >
          <div className="text-sm font-semibold text-slate-900">Tests</div>
          <div className="mt-2 text-sm text-slate-600">Create tests and questions.</div>
        </Link>

        <Link
          href="/admin/exams/sessions"
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:bg-slate-50"
        >
          <div className="text-sm font-semibold text-slate-900">Sessions</div>
          <div className="mt-2 text-sm text-slate-600">Schedule sessions and manage conductors.</div>
        </Link>

        <Link
          href="/admin/exams/conductors"
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm hover:bg-slate-50"
        >
          <div className="text-sm font-semibold text-slate-900">Conductors</div>
          <div className="mt-2 text-sm text-slate-600">Create and link conductors to user accounts.</div>
        </Link>
      </div>
    </div>
  );
}
