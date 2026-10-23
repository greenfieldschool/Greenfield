"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  ChevronDown,
  FileText,
  HeartPulse,
  Home,
  LogOut,
  MoreHorizontal,
  Receipt,
  ShieldCheck,
  Smile,
  User,
  Users,
  MessagesSquare,
  X,
  type LucideIcon
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { WHATSAPP_URL, WhatsAppIcon } from "@/components/whatsapp-button";
import { cn } from "@/lib/cn";

type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean; tab?: boolean };

const studentNav: NavItem[] = [
  { href: "/portal", label: "Home", icon: Home, exact: true, tab: true },
  { href: "/portal/exams", label: "Exams", icon: FileText, exact: true, tab: true },
  { href: "/portal/exams/results", label: "Exam results", icon: BarChart3, tab: true },
  { href: "/portal/academics", label: "Report card", icon: BookOpen, tab: true },
  { href: "/portal/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/portal/activities", label: "Activities", icon: Smile },
  { href: "/portal/incidents", label: "Health", icon: HeartPulse },
  { href: "/portal/students", label: "My profile", icon: User }
];

const parentNav: NavItem[] = [
  { href: "/portal", label: "Home", icon: Home, exact: true, tab: true },
  { href: "/portal/messages", label: "Messages", icon: MessagesSquare, tab: true },
  { href: "/portal/academics", label: "Report cards", icon: BookOpen, tab: true },
  { href: "/portal/billing", label: "Fees & billing", icon: Receipt, tab: true },
  { href: "/portal/students", label: "My children", icon: Users },
  { href: "/portal/attendance", label: "Attendance", icon: CalendarCheck },
  { href: "/portal/discipline", label: "Discipline", icon: ShieldCheck },
  { href: "/portal/activities", label: "Activities", icon: Smile },
  { href: "/portal/incidents", label: "Health", icon: HeartPulse },
  { href: "/portal/profile", label: "My profile", icon: User }
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

export default function PortalShell({
  role,
  displayName,
  displayEmail,
  unreadMessages = 0,
  children
}: {
  role: "student" | "parent";
  displayName: string;
  displayEmail: string;
  /** Unread messages, shown as a badge on "Messages". */
  unreadMessages?: number;
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/portal";
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const nav = role === "student" ? studentNav : parentNav;
  const tabs = nav.filter((n) => n.tab);
  const extras = nav.filter((n) => !n.tab);
  const moreActive = extras.some((n) => isActive(pathname, n));
  const initial = displayName.charAt(0).toUpperCase() || "?";

  useEffect(() => {
    setMoreOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMoreOpen(false);
        setMenuOpen(false);
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md print:hidden">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/portal" aria-label="Portal home">
            <Logo subtitle={role === "student" ? "Student portal" : "Parent portal"} />
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2 hover:bg-slate-100"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-green text-sm font-semibold text-white ring-2 ring-brand-gold/40">
                {initial}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-[180px] truncate text-sm font-semibold text-slate-900">{displayName}</span>
                <span className="block text-xs text-slate-500">{role === "student" ? "Student" : "Parent / guardian"}</span>
              </span>
              <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden="true" />
            </button>
            {menuOpen ? (
              <div role="menu" className="absolute right-0 mt-2 w-64 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl">
                <div className="px-3 py-2.5">
                  <div className="truncate text-sm font-semibold text-slate-900">{displayName}</div>
                  <div className="truncate text-xs text-slate-500">{displayEmail}</div>
                </div>
                <div className="my-1 border-t border-slate-100" />
                <a
                  role="menuitem"
                  href={WHATSAPP_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <WhatsAppIcon className="h-4 w-4 text-[#25D366]" />
                  Message the school
                </a>
                <form action="/portal/logout" method="post">
                  <button
                    role="menuitem"
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Sign out
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 pb-28 pt-6 sm:px-6 lg:pb-16 lg:pt-8 print:max-w-none print:p-0">
        {/* Desktop side nav */}
        <aside className="hidden w-60 shrink-0 lg:block print:!hidden">
          <nav className="sticky top-24 space-y-0.5" aria-label="Portal">
            {nav.map((item) => {
              const active = isActive(pathname, item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                    active
                      ? "bg-white text-brand-green shadow-card ring-1 ring-slate-200/80"
                      : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                  )}
                >
                  <item.icon
                    className={cn("h-[18px] w-[18px]", active ? "text-brand-green-600" : "text-slate-400")}
                    aria-hidden="true"
                  />
                  {item.label}
                  {item.href === "/portal/messages" && unreadMessages > 0 ? (
                    <span className="ml-auto inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand-green px-1.5 text-[11px] font-bold text-white">
                      {unreadMessages > 99 ? "99+" : unreadMessages}
                      <span className="sr-only"> unread</span>
                    </span>
                  ) : null}
                </Link>
              );
            })}
            <div className="!mt-6 rounded-2xl bg-brand-green p-4 text-white">
              <div className="text-sm font-semibold">Need help?</div>
              <p className="mt-1 text-xs text-brand-green-100">Message the school office on WhatsApp.</p>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
              >
                <WhatsAppIcon className="h-3.5 w-3.5" />
                Chat with us
              </a>
            </div>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">{children}</main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        aria-label="Portal"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden print:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((item) => {
            const active = isActive(pathname, item);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
                  active ? "text-brand-green" : "text-slate-500"
                )}
              >
                <span
                  className={cn(
                    "relative inline-flex h-7 w-12 items-center justify-center rounded-full transition",
                    active && "bg-brand-green-50"
                  )}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                  {item.href === "/portal/messages" && unreadMessages > 0 ? (
                    <span className="absolute -top-1 right-1.5 inline-flex min-w-[1.1rem] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-4 text-white">
                      {unreadMessages > 9 ? "9+" : unreadMessages}
                      <span className="sr-only"> unread</span>
                    </span>
                  ) : null}
                </span>
                <span className="max-w-full truncate px-1">{item.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            aria-controls="portal-more-sheet"
            className={cn(
              "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium",
              moreActive ? "text-brand-green" : "text-slate-500"
            )}
          >
            <span className={cn("inline-flex h-7 w-12 items-center justify-center rounded-full", moreActive && "bg-brand-green-50")}>
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            </span>
            More
          </button>
        </div>
      </nav>

      {/* Mobile "More" sheet */}
      <div
        className={cn("fixed inset-0 z-50 lg:hidden", moreOpen ? "pointer-events-auto" : "pointer-events-none")}
        aria-hidden={!moreOpen}
      >
        <div
          className={cn("absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity", moreOpen ? "opacity-100" : "opacity-0")}
          onClick={() => setMoreOpen(false)}
        />
        <div
          id="portal-more-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="More"
          className={cn(
            "absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl transition-transform duration-300 ease-out",
            moreOpen ? "translate-y-0" : "translate-y-full"
          )}
        >
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200" aria-hidden="true" />
          <div className="flex items-center justify-between px-2">
            <div className="text-sm font-semibold text-slate-900">More</div>
            <button
              type="button"
              onClick={() => setMoreOpen(false)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {extras.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border p-4 text-center text-xs font-medium",
                  isActive(pathname, item)
                    ? "border-brand-green-200 bg-brand-green-50 text-brand-green"
                    : "border-slate-200 text-slate-700"
                )}
              >
                <item.icon className="h-5 w-5" aria-hidden="true" />
                {item.label}
              </Link>
            ))}
            <a
              href={WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 p-4 text-center text-xs font-medium text-slate-700"
            >
              <WhatsAppIcon className="h-5 w-5 text-[#25D366]" />
              Message school
            </a>
          </div>
          <form action="/portal/logout" method="post" className="mt-3">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-red-50 py-3 text-sm font-semibold text-red-600"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sign out
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
