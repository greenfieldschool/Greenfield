"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  BookMarked,
  BookOpen,
  Briefcase,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  HeartPulse,
  Home,
  KeyRound,
  Landmark,
  LayoutDashboard,
  LibraryBig,
  LifeBuoy,
  LogOut,
  Megaphone,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
  School,
  Settings,
  Shapes,
  Shirt,
  MessagesSquare,
  HeartHandshake,
  ListChecks,
  ScrollText,
  History,
  FilePen,
  UserRound,
  ShieldAlert,
  SlidersHorizontal,
  Timer,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  X,
  type LucideIcon
} from "lucide-react";
import { LogoMark } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  /** Sub-paths that belong to a different nav item. */
  excludes?: string[];
  adminOnly?: boolean;
  /** Teachers and admins only (messaging). */
  chatOnly?: boolean;
};

type NavGroup = {
  key: string;
  label: string;
  items: NavItem[];
  adminOnly?: boolean;
};

type AdminShellProps = {
  userEmail: string;
  role: string | null;
  /** Unread messages, shown as a badge on "Messages". */
  unreadMessages?: number;
  children: ReactNode;
};

const STORAGE_KEY = "gf_admin_sidebar_collapsed";

// Admin-only sections mirror adminOnlyPrefixes in src/lib/route-access.ts (enforced by src/middleware.ts) and RLS.
const NAV: NavGroup[] = [
  {
    key: "overview",
    label: "Overview",
    items: [
      { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/admin/messages", label: "Messages", icon: MessagesSquare, chatOnly: true }
    ]
  },
  {
    key: "people",
    label: "People",
    items: [
      { href: "/admin/students", label: "Students", icon: GraduationCap, excludes: ["/admin/students/applications"] },
      { href: "/admin/students/applications", label: "Applications", icon: UserPlus },
      { href: "/admin/classes", label: "Classes", icon: School },
      { href: "/admin/guardians", label: "Guardians", icon: UsersRound },
      { href: "/admin/users", label: "Staff & users", icon: UserCog, adminOnly: true }
    ]
  },
  {
    key: "results",
    label: "Result management",
    items: [
      {
        href: "/admin/academics/results",
        label: "Class result sheet",
        icon: FileSpreadsheet,
        excludes: ["/admin/academics/results/pupil"]
      },
      { href: "/admin/academics/results/pupil", label: "Single pupil results", icon: UserRound },
      { href: "/admin/academics/reports", label: "Report cards", icon: ScrollText },
      { href: "/admin/academics/corrections", label: "Correction requests", icon: FilePen },
      { href: "/admin/academics/audit", label: "Results history", icon: History },
      { href: "/admin/academics/config", label: "Grading & layouts", icon: SlidersHorizontal }
    ]
  },
  {
    key: "academics",
    label: "Academics",
    items: [
      { href: "/admin/academics/subjects", label: "Subjects", icon: BookOpen, adminOnly: true },
      { href: "/admin/academics/class-subjects", label: "Class subjects", icon: Shapes, adminOnly: true },
      { href: "/admin/academics/teachers", label: "Teacher assignments", icon: UserCheck, adminOnly: true },
      { href: "/admin/academics/assessments", label: "Assessments", icon: ClipboardCheck },
      { href: "/admin/academics/publications", label: "Publish results", icon: Megaphone }
    ]
  },
  {
    key: "exams",
    label: "Exams (CBT)",
    items: [
      { href: "/admin/exams", label: "Exams overview", icon: BarChart3, exact: true },
      { href: "/admin/exams/tests", label: "Tests & questions", icon: FileText },
      { href: "/admin/exams/sessions", label: "Sessions", icon: Timer },
      { href: "/admin/exams/conductors", label: "Conductors", icon: KeyRound }
    ]
  },
  {
    key: "welfare",
    label: "Welfare",
    items: [
      { href: "/admin/welfare/scores", label: "Welfare scores", icon: HeartHandshake },
      { href: "/admin/welfare/attendance", label: "Attendance", icon: CalendarCheck },
      { href: "/admin/welfare/incidents", label: "Health & incidents", icon: HeartPulse },
      { href: "/admin/welfare/discipline", label: "Discipline", icon: ShieldAlert },
      { href: "/admin/welfare/uniform", label: "Uniform", icon: Shirt },
      { href: "/admin/welfare/criteria", label: "Welfare criteria", icon: ListChecks, adminOnly: true }
    ]
  },
  {
    key: "finance",
    label: "Finance",
    adminOnly: true,
    items: [
      { href: "/admin/finance", label: "Finance overview", icon: Landmark, exact: true },
      { href: "/admin/finance/payments", label: "Payments", icon: Wallet },
      { href: "/admin/finance/invoices", label: "Invoices", icon: Receipt },
      { href: "/admin/finance/debtors", label: "Debtors", icon: ClipboardList },
      { href: "/admin/finance/fees", label: "Fees setup", icon: LibraryBig },
      { href: "/admin/finance/expenses", label: "Expenses", icon: BookMarked }
    ]
  },
  {
    key: "careers",
    label: "Careers",
    adminOnly: true,
    items: [
      { href: "/admin/careers", label: "Job posts", icon: Briefcase, excludes: ["/admin/careers/applications"] },
      { href: "/admin/careers/applications", label: "Job applications", icon: FileText }
    ]
  }
];

// Friendly names for breadcrumb segments.
const SEGMENT_LABELS: Record<string, string> = {
  admin: "Dashboard",
  students: "Students",
  applications: "Applications",
  classes: "Classes",
  guardians: "Guardians",
  users: "Staff & users",
  academics: "Academics",
  results: "Result sheet",
  pupil: "Single pupil",
  assessments: "Assessments",
  publications: "Publish results",
  subjects: "Subjects",
  "class-subjects": "Class subjects",
  config: "Grading & layouts",
  reports: "Report cards",
  comments: "Comments",
  print: "Print",
  scores: "Welfare scores",
  criteria: "Welfare criteria",
  audit: "Results history",
  corrections: "Correction requests",
  messages: "Messages",
  moderation: "Moderation",
  exams: "Exams",
  tests: "Tests",
  sessions: "Sessions",
  conductors: "Conductors",
  attempts: "Attempts",
  preview: "Preview",
  welfare: "Welfare",
  attendance: "Attendance",
  incidents: "Health & incidents",
  discipline: "Discipline",
  uniform: "Uniform",
  finance: "Finance",
  payments: "Payments",
  invoices: "Invoices",
  debtors: "Debtors",
  fees: "Fees",
  expenses: "Expenses",
  schedules: "Schedules",
  components: "Components",
  "academic-years": "Academic years",
  "budget-sectors": "Budget sectors",
  "revenue-categories": "Revenue categories",
  careers: "Careers",
  learn: "Learn Centre",
  profile: "Profile",
  "change-password": "Change password",
  settings: "Settings",
  new: "New"
};

function isActivePath(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  if (item.excludes?.some((p) => pathname === p || pathname.startsWith(p + "/"))) return false;
  return pathname === item.href || pathname.startsWith(item.href + "/");
}

function roleLabel(role: string | null) {
  switch (role) {
    case "super_admin":
      return "Super admin";
    case "admin":
      return "Administrator";
    case "teacher":
      return "Teacher";
    case "front_desk":
      return "Front desk";
    case "nurse":
      return "Nurse";
    default:
      return "Staff";
  }
}

function useBreadcrumbs(pathname: string) {
  return useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const crumbs: Array<{ href: string; label: string }> = [];
    let href = "";
    for (const part of parts) {
      href += `/${part}`;
      const looksLikeId = /^[0-9a-f-]{16,}$/i.test(part) || part === "unassigned";
      crumbs.push({ href, label: looksLikeId ? "Details" : (SEGMENT_LABELS[part] ?? part.replace(/-/g, " ")) });
    }
    return crumbs;
  }, [pathname]);
}

export default function AdminShell({ userEmail, role, unreadMessages = 0, children }: AdminShellProps) {
  const pathname = usePathname() ?? "/admin";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = role === "super_admin" || role === "admin";
  const crumbs = useBreadcrumbs(pathname);

  const navGroups = useMemo(
    () =>
      NAV.filter((g) => isAdmin || !g.adminOnly)
        .map((g) => ({
          ...g,
          items: g.items.filter((i) => (isAdmin || !i.adminOnly) && (!i.chatOnly || isAdmin || role === "teacher"))
        }))
        .filter((g) => g.items.length > 0),
    [isAdmin, role]
  );

  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // ignore
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setProfileOpen(false);
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) setProfileOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  const initial = (userEmail || "?").slice(0, 1).toUpperCase();

  function Sidebar({ variant }: { variant: "desktop" | "mobile" }) {
    const compact = variant === "desktop" && collapsed;
    return (
      <div className="flex h-full flex-col">
        {/* Brand */}
        <div className={cn("flex h-16 shrink-0 items-center gap-3 px-5", compact && "justify-center px-0")}>
          <Link href="/admin" className="flex items-center gap-2.5" aria-label="Greenfield staff dashboard">
            <LogoMark className="h-9 w-8 shrink-0" />
            {!compact ? (
              <span className="leading-none">
                <span className="block font-display text-[1.05rem] font-semibold text-white">Greenfield</span>
                <span className="mt-1 block text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-brand-gold-300">
                  Staff dashboard
                </span>
              </span>
            ) : null}
          </Link>
          {variant === "mobile" ? (
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="ml-auto inline-flex h-9 w-9 items-center justify-center rounded-lg text-brand-green-200 hover:bg-white/10 hover:text-white"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {/* Nav */}
        <nav className={cn("flex-1 overflow-y-auto pb-4 pt-2", compact ? "px-2" : "px-3")} aria-label="Admin">
          {navGroups.map((group) => (
            <div key={group.key} className="mt-4 first:mt-0">
              {!compact && group.key !== "overview" ? (
                <div className="px-3 pb-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-brand-green-400">
                  {group.label}
                </div>
              ) : compact && group.key !== "overview" ? (
                <div className="mx-3 mb-2 border-t border-white/10" aria-hidden="true" />
              ) : null}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActivePath(pathname, item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        title={compact ? item.label : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition",
                          compact ? "justify-center px-0" : "px-3",
                          active
                            ? "bg-white/10 text-white"
                            : "text-brand-green-100/80 hover:bg-white/[0.06] hover:text-white"
                        )}
                      >
                        {active ? (
                          <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-brand-gold" aria-hidden="true" />
                        ) : null}
                        <Icon
                          className={cn(
                            "h-[18px] w-[18px] shrink-0",
                            active ? "text-brand-gold-300" : "text-brand-green-300 group-hover:text-brand-green-100"
                          )}
                          aria-hidden="true"
                        />
                        {!compact ? <span className="truncate">{item.label}</span> : null}
                        {item.href === "/admin/messages" && unreadMessages > 0 ? (
                          <span
                            className={cn(
                              "inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-brand-gold px-1.5 text-[11px] font-bold text-brand-green-950",
                              compact ? "absolute right-1 top-0.5" : "ml-auto"
                            )}
                          >
                            {unreadMessages > 99 ? "99+" : unreadMessages}
                            <span className="sr-only"> unread</span>
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className={cn("shrink-0 border-t border-white/10 py-3", compact ? "px-2" : "px-3")}>
          <Link
            href="/admin/learn"
            title={compact ? "Learn Centre" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg py-2 text-sm font-medium transition",
              compact ? "justify-center" : "px-3",
              pathname.startsWith("/admin/learn")
                ? "bg-white/10 text-white"
                : "text-brand-green-100/80 hover:bg-white/[0.06] hover:text-white"
            )}
          >
            <LifeBuoy className="h-[18px] w-[18px] shrink-0 text-brand-green-300" aria-hidden="true" />
            {!compact ? "Learn Centre & help" : null}
          </Link>
          <Link
            href="/"
            title={compact ? "View website" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-lg py-2 text-sm font-medium text-brand-green-100/80 transition hover:bg-white/[0.06] hover:text-white",
              compact ? "justify-center" : "px-3"
            )}
          >
            <Home className="h-[18px] w-[18px] shrink-0 text-brand-green-300" aria-hidden="true" />
            {!compact ? "View website" : null}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden bg-brand-green-950 transition-[width] duration-200 lg:block print:!hidden",
          collapsed ? "w-[76px]" : "w-64"
        )}
      >
        <Sidebar variant="desktop" />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn("fixed inset-0 z-50 lg:hidden", mobileOpen ? "pointer-events-auto" : "pointer-events-none")}
        aria-hidden={!mobileOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-slate-950/50 backdrop-blur-sm transition-opacity",
            mobileOpen ? "opacity-100" : "opacity-0"
          )}
          onClick={() => setMobileOpen(false)}
        />
        <div
          id="admin-mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={cn(
            "absolute inset-y-0 left-0 w-[86%] max-w-[300px] bg-brand-green-950 shadow-2xl transition-transform duration-300 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Sidebar variant="mobile" />
        </div>
      </div>

      <div className={cn("transition-[padding] duration-200 print:!pl-0", collapsed ? "lg:pl-[76px]" : "lg:pl-64")}>
        {/* Top bar */}
        <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/85 backdrop-blur-md print:hidden">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-controls="admin-mobile-drawer"
              aria-expanded={mobileOpen}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="hidden h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:inline-flex"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
              ) : (
                <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
              )}
            </button>

            {/* Breadcrumbs */}
            <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
              <ol className="flex items-center gap-1 text-sm">
                {crumbs.map((c, i) => {
                  const last = i === crumbs.length - 1;
                  return (
                    <li key={c.href} className={cn("flex min-w-0 items-center gap-1", !last && "hidden sm:flex")}>
                      {i > 0 ? <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" /> : null}
                      {last ? (
                        <span className="truncate font-semibold capitalize text-slate-900" aria-current="page">
                          {c.label}
                        </span>
                      ) : (
                        <Link href={c.href} className="truncate capitalize text-slate-500 hover:text-slate-900">
                          {c.label}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ol>
            </nav>

            {/* Profile */}
            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                className="flex items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2.5 text-left hover:bg-slate-100"
                onClick={() => setProfileOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-green text-sm font-semibold text-white">
                  {initial}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block max-w-[200px] truncate text-sm font-semibold text-slate-900">{userEmail}</span>
                  <span className="block text-xs text-slate-500">{roleLabel(role)}</span>
                </span>
                <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" aria-hidden="true" />
              </button>

              {profileOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-xl"
                >
                  <div className="px-3 py-2.5 sm:hidden">
                    <div className="truncate text-sm font-semibold text-slate-900">{userEmail}</div>
                    <div className="text-xs text-slate-500">{roleLabel(role)}</div>
                  </div>
                  {[
                    { href: "/admin/profile", label: "My profile", icon: Users },
                    { href: "/admin/change-password", label: "Change password", icon: KeyRound },
                    ...(isAdmin ? [{ href: "/admin/settings", label: "Settings", icon: Settings }] : [])
                  ].map((m) => (
                    <Link
                      key={m.href}
                      role="menuitem"
                      href={m.href}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                    >
                      <m.icon className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      {m.label}
                    </Link>
                  ))}
                  <div className="my-1 border-t border-slate-100" />
                  <form action="/admin/logout" method="post">
                    <button
                      role="menuitem"
                      className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-red-600 hover:bg-red-50"
                      type="submit"
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

        <main className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8 print:max-w-none print:p-0">{children}</main>
      </div>
    </div>
  );
}
