import { school } from "@/lib/school";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <div className="text-sm font-semibold text-slate-900">Greenfield School</div>
            <div className="mt-2 text-sm text-slate-600">
              Deep roots. Bright futures.
            </div>
          </div>
          <div className="text-sm text-slate-600">
            <div className="font-semibold text-slate-900">Contact</div>
            <div className="mt-2">{school.email}</div>
            <div>{school.phone}</div>
          </div>
          <div className="text-sm text-slate-600">
            <div className="font-semibold text-slate-900">Portals</div>
            <div className="mt-2 flex flex-col gap-2">
              <a className="font-semibold text-slate-700 hover:text-slate-900" href="/admin/login">
                Staff dashboard
              </a>
              <a className="font-semibold text-slate-700 hover:text-slate-900" href="/portal/login">
                Student / Parent portal
              </a>
            </div>
          </div>
          <div className="text-sm text-slate-600">
            <div className="font-semibold text-slate-900">Location</div>
            <div className="mt-2">{school.address}</div>
          </div>
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div>© {year} Greenfield School. All rights reserved.</div>
          <div className="flex gap-4">
            <a className="hover:text-slate-700" href="/careers">
              Careers
            </a>
            <a className="hover:text-slate-700" href="/privacy">
              Privacy
            </a>
            <a className="hover:text-slate-700" href="/terms">
              Terms
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
