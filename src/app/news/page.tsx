import Link from "next/link";

const posts = [
  {
    slug: "welcome-to-greenfield",
    title: "Welcome to Greenfield School",
    date: "2026-01-01",
    excerpt: "A new year of learning, growth, and community."
  },
  {
    slug: "science-week-highlights",
    title: "Science Week Highlights",
    date: "2026-01-10",
    excerpt: "Exploration, experiments, and student-led discovery."
  }
];

export default function NewsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">News</h1>
        <p className="mt-4 text-slate-600">Latest updates, achievements, and announcements.</p>
      </div>

      <div className="mt-10 grid gap-6 md:grid-cols-2">
        {posts.map((p) => (
          <div key={p.slug} className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="text-xs font-semibold text-slate-500">{p.date}</div>
            <div className="mt-2 text-lg font-semibold text-slate-900">{p.title}</div>
            <p className="mt-2 text-sm text-slate-600">{p.excerpt}</p>
            <div className="mt-4">
              <Link href="/contact" className="text-sm font-semibold text-slate-900 hover:text-slate-700">
                Contact us
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
