"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const nav = [
  { href: "/about", label: "About" },
  { href: "/academics", label: "Academics" },
  { href: "/admissions", label: "Admissions" },
  { href: "/student-life", label: "Student Life" },
  { href: "/careers", label: "Careers" },
  { href: "/news", label: "News" },
  { href: "/events", label: "Events" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" }
];

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-green text-sm font-semibold text-white">
            G
          </span>
          <span className="text-sm font-semibold tracking-tight text-slate-900">Greenfield School</span>
        </Link>
        <nav className="hidden items-center gap-6 md:flex">
          {nav.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm font-semibold text-slate-700 hover:text-slate-900"
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-xl bg-brand-gold px-4 py-2 text-sm font-semibold text-slate-900 hover:brightness-95"
          >
            Book a Visit
          </Link>
        </nav>
        <div className="flex items-center gap-2 md:hidden">
          <Link
            href="/contact"
            className="inline-flex items-center justify-center rounded-xl bg-brand-gold px-4 py-2 text-sm font-semibold text-slate-900 hover:brightness-95"
          >
            Visit
          </Link>
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-controls="site-mobile-menu"
            aria-expanded={open}
          >
            <span className="text-lg font-semibold">≡</span>
          </button>
        </div>
      </div>

      <div
        className={
          "fixed inset-0 z-50 md:hidden " +
          (open ? "pointer-events-auto" : "pointer-events-none")
        }
        aria-hidden={!open}
      >
        <div
          className={
            "absolute inset-0 bg-slate-900/40 transition-opacity duration-200 " +
            (open ? "opacity-100" : "opacity-0")
          }
          onClick={() => setOpen(false)}
        />

        <div
          id="site-mobile-menu"
          role="dialog"
          aria-modal="true"
          className={
            "absolute left-0 right-0 top-0 border-b border-slate-200 bg-white shadow-xl transition-transform duration-200 " +
            (open ? "translate-y-0" : "-translate-y-full")
          }
        >
          <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
            <div className="flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-brand-green text-sm font-semibold text-white">
                  G
                </span>
                <span className="text-sm font-semibold tracking-tight text-slate-900">Greenfield School</span>
              </Link>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <span className="text-lg font-semibold">×</span>
              </button>
            </div>

            <nav className="mt-6 grid gap-1">
              {nav.map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="rounded-xl px-3 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-6">
              <Link
                href="/contact"
                className="inline-flex w-full items-center justify-center rounded-xl bg-brand-gold px-4 py-3 text-sm font-semibold text-slate-900 hover:brightness-95"
              >
                Book a Visit
              </Link>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
