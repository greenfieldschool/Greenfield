import { CalendarDays, MapPin } from "lucide-react";
import { PublicPageHero, PublicSection } from "@/components/ui/public-page";
import { splitIsoDate } from "../_lib/media";

const events = [
  { title: "Open Day", date: "2026-02-05", location: "Main Campus" },
  { title: "Sports Showcase", date: "2026-02-20", location: "Athletics Grounds" },
  { title: "Arts Evening", date: "2026-03-07", location: "Auditorium" }
];

export default function EventsPage() {
  return (
    <div>
      <PublicPageHero eyebrow="Events" title="Events" description="What’s happening at Greenfield." />

      <PublicSection>
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {events.map((e) => {
            const d = splitIsoDate(e.date);
            return (
              <li
                key={e.title}
                className="flex gap-5 rounded-3xl border border-slate-200/80 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lift"
              >
                <div className="flex h-20 w-20 shrink-0 flex-col items-center justify-center rounded-2xl bg-brand-green text-white">
                  <span className="font-display text-3xl font-semibold leading-none">{d.day}</span>
                  <span className="mt-1 text-xs font-semibold uppercase tracking-wider text-brand-gold-300">{d.month}</span>
                </div>
                <div className="min-w-0">
                  <h2 className="font-display text-xl font-semibold text-slate-900">{e.title}</h2>
                  <div className="mt-2 flex items-center gap-2 text-sm text-slate-600">
                    <CalendarDays className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
                    <time dateTime={e.date}>{d.label}</time>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
                    <MapPin className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
                    {e.location}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </PublicSection>
    </div>
  );
}
