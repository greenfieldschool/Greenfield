import Link from "next/link";
import { ArrowRight, Newspaper } from "lucide-react";
import { PublicPageHero, PublicSection } from "@/components/ui/public-page";
import { splitIsoDate } from "../_lib/media";

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
    <div>
      <PublicPageHero eyebrow="News" title="News" description="Latest updates, achievements, and announcements." />

      <PublicSection>
        <div className="grid gap-6 md:grid-cols-2">
          {posts.map((p) => (
            <article
              key={p.slug}
              className="group flex flex-col rounded-3xl border border-slate-200/80 bg-white p-8 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                  <Newspaper className="h-5 w-5" aria-hidden="true" />
                </span>
                <time dateTime={p.date} className="text-sm font-medium text-slate-500">
                  {splitIsoDate(p.date).label}
                </time>
              </div>
              <h2 className="mt-5 font-display text-2xl font-semibold text-slate-900">{p.title}</h2>
              <p className="mt-2 flex-1 leading-relaxed text-slate-600">{p.excerpt}</p>
              <Link
                href="/contact"
                className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green hover:text-brand-green-700"
              >
                Contact us
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </PublicSection>
    </div>
  );
}
