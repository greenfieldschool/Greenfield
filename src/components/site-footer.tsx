export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Greenfield School</div>
            <div className="mt-2 text-sm text-slate-600">
              Deep roots. Bright futures.
            </div>
          </div>
          <div className="text-sm text-slate-600">
            <div className="font-semibold text-slate-900">Contact</div>
            <div className="mt-2">admissions@greenfield.school</div>
            <div>+000 000 000 000</div>
          </div>
          <div className="text-sm text-slate-600">
            <div className="font-semibold text-slate-900">Location</div>
            <div className="mt-2">Greenfield Campus</div>
            <div>City, Country</div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div>© {year} Greenfield School. All rights reserved.</div>
          <div className="flex gap-4">
            <a className="hover:text-slate-700" href="#">
              Privacy
            </a>
            <a className="hover:text-slate-700" href="#">
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
