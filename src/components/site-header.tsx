"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogIn, Mail, MapPin, Menu, Phone, X } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { school } from "@/lib/school";

const primaryNav = [
  { href: "/about", label: "About" },
  { href: "/academics", label: "Academics" },
  { href: "/admissions", label: "Admissions" },
  { href: "/student-life", label: "Student Life" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" }
];

const moreNav = [
  { href: "/news", label: "News", description: "Updates from around the school" },
  { href: "/events", label: "Events", description: "Open days, ceremonies and calendar" },
  { href: "/careers", label: "Careers", description: "Join the Greenfield team" }
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(href + "/");
}

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        setMoreOpen(false);
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const moreActive = moreNav.some((i) => isActive(pathname, i.href));

  return (
    <>
      {/* Utility bar */}
      <div className="hidden bg-brand-green-950 text-[13px] text-brand-green-100 md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2">
          <div className="flex items-center gap-6">
            <a href={`tel:${school.phone}`} className="inline-flex items-center gap-2 hover:text-white">
              <Phone className="h-3.5 w-3.5 text-brand-gold" aria-hidden="true" />
              {school.phone}
            </a>
            <a href={`mailto:${school.email}`} className="inline-flex items-center gap-2 hover:text-white">
              <Mail className="h-3.5 w-3.5 text-brand-gold" aria-hidden="true" />
              {school.email}
            </a>
            <span className="hidden items-center gap-2 lg:inline-flex">
              <MapPin className="h-3.5 w-3.5 text-brand-gold" aria-hidden="true" />
              Osapa London, Lekki, Lagos
            </span>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/portal/login" className="inline-flex items-center gap-1.5 font-medium hover:text-white">
              <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
              Parent &amp; student portal
            </Link>
            <Link href="/admin/login" className="font-medium text-brand-green-300 hover:text-white">
              Staff
            </Link>
          </div>
        </div>
      </div>

      <header
        className={cn(
          "sticky top-0 z-40 border-b bg-white/90 backdrop-blur-md transition-shadow",
          scrolled ? "border-slate-200 shadow-[0_1px_12px_rgba(15,23,42,0.06)]" : "border-transparent"
        )}
      >
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" aria-label="Greenfield School home" className="shrink-0">
            <Logo />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {primaryNav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  isActive(pathname, item.href)
                    ? "text-brand-green"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                {item.label}
                {isActive(pathname, item.href) ? (
                  <span className="mx-auto mt-0.5 block h-0.5 w-4 rounded-full bg-brand-gold" aria-hidden="true" />
                ) : null}
              </Link>
            ))}

            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                className={cn(
                  "inline-flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition",
                  moreActive ? "text-brand-green" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )}
              >
                More
                <ChevronDown className={cn("h-4 w-4 transition", moreOpen && "rotate-180")} aria-hidden="true" />
              </button>
              {moreOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
                >
                  {moreNav.map((item) => (
                    <Link
                      key={item.href}
                      role="menuitem"
                      href={item.href}
                      className="block rounded-xl px-3 py-2.5 hover:bg-slate-50"
                    >
                      <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                      <div className="text-xs text-slate-500">{item.description}</div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          </nav>

          <div className="flex items-center gap-2">
            <Link href="/apply" className={buttonClasses({ variant: "secondary", className: "hidden xl:inline-flex" })}>
              Apply now
            </Link>
            <Link href="/contact" className={buttonClasses({ variant: "gold", className: "hidden sm:inline-flex" })}>
              Book a visit
            </Link>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 lg:hidden"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-controls="site-mobile-menu"
              aria-expanded={open}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      <div
        className={cn("fixed inset-0 z-50 lg:hidden", open ? "pointer-events-auto" : "pointer-events-none")}
        aria-hidden={!open}
      >
        <div
          className={cn(
            "absolute inset-0 bg-brand-green-950/50 backdrop-blur-sm transition-opacity duration-200",
            open ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setOpen(false)}
        />
        <div
          id="site-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={cn(
            "absolute inset-y-0 right-0 flex w-full max-w-sm flex-col bg-white shadow-2xl transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "translate-x-full"
          )}
        >
          <div className="flex h-[72px] items-center justify-between border-b border-slate-100 px-5">
            <Logo />
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-800 hover:bg-slate-50"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Mobile">
            {[...primaryNav, ...moreNav].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center justify-between rounded-xl px-3 py-3 text-base font-medium",
                  isActive(pathname, item.href) ? "bg-brand-green-50 text-brand-green" : "text-slate-800 hover:bg-slate-50"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="space-y-3 border-t border-slate-100 p-5">
            <div className="grid grid-cols-2 gap-2">
              <Link href="/apply" className={buttonClasses({ variant: "secondary", size: "lg" })}>
                Apply now
              </Link>
              <Link href="/contact" className={buttonClasses({ variant: "gold", size: "lg" })}>
                Book a visit
              </Link>
            </div>
            <Link href="/portal/login" className={buttonClasses({ variant: "primary", size: "lg", className: "w-full" })}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              Parent &amp; student portal
            </Link>
            <div className="flex items-center justify-between pt-1 text-sm text-slate-500">
              <a href={`tel:${school.phone}`} className="inline-flex items-center gap-2">
                <Phone className="h-4 w-4" aria-hidden="true" />
                {school.phone}
              </a>
              <Link href="/admin/login" className="font-medium hover:text-slate-800">
                Staff login
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
