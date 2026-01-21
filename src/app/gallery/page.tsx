const items = [
  { title: "Campus Life", tag: "Campus" },
  { title: "Science Lab", tag: "STEM" },
  { title: "Sports Day", tag: "Sports" },
  { title: "Arts Studio", tag: "Arts" },
  { title: "Library", tag: "Learning" },
  { title: "Clubs", tag: "Community" }
];

export default function GalleryPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-14">
      <div className="max-w-3xl">
        <h1 className="text-3xl font-semibold text-slate-900">Gallery</h1>
        <p className="mt-4 text-slate-600">
          A preview of student life and campus experiences.
        </p>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
              {item.tag}
            </div>
            <div className="mt-3 text-lg font-semibold text-slate-900">{item.title}</div>
            <div className="mt-3 h-28 rounded-xl bg-[linear-gradient(135deg,rgba(11,61,46,0.18),rgba(212,160,23,0.18))]" />
          </div>
        ))}
      </div>
    </div>
  );
}
