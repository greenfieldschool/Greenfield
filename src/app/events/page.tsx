const events = [
  { title: "Open Day", date: "2026-02-05", location: "Main Campus" },
  { title: "Sports Showcase", date: "2026-02-20", location: "Athletics Grounds" },
  { title: "Arts Evening", date: "2026-03-07", location: "Auditorium" }
];

export default function EventsPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">Events</h1>
        <p className="mt-4 text-slate-600">What’s happening at Greenfield.</p>
      </div>

      <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid grid-cols-3 gap-0 border-b border-slate-200 bg-slate-50 px-6 py-3 text-xs font-semibold text-slate-600">
          <div>Date</div>
          <div>Event</div>
          <div>Location</div>
        </div>
        <div>
          {events.map((e) => (
            <div
              key={e.title}
              className="grid grid-cols-3 gap-0 border-b border-slate-200 px-6 py-4 text-sm text-slate-700 last:border-b-0"
            >
              <div className="font-semibold text-slate-900">{e.date}</div>
              <div>{e.title}</div>
              <div className="text-slate-600">{e.location}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
