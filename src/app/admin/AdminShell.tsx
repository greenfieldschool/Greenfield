"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type NavItem = {
  href: string;
  label: string;
  shortLabel?: string;
};

type NavGroup = {
  key: string;
  label: string;
  items: NavItem[];
};

type AdminShellProps = {
  userEmail: string;
  role: string | null;
  children: ReactNode;
};

const STORAGE_KEY = "gf_admin_sidebar_collapsed";

function isActivePath(pathname: string, href: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AdminShell({ userEmail, role, children }: AdminShellProps) {
  const pathname = usePathname() ?? "/admin";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  const isAdmin = role === "super_admin" || role === "admin";

  const navGroups: NavGroup[] = useMemo(
    () => {
      const groups: NavGroup[] = [
      {
        key: "core",
        label: "Core",
        items: [
          { href: "/admin", label: "Dashboard" },
          { href: "/admin/students", label: "Students" },
          { href: "/admin/guardians", label: "Guardians" }
        ]
      },
      {
        key: "academics",
        label: "Academics",
        items: [
          { href: "/admin/academics/subjects", label: "Subjects", shortLabel: "Subj" },
          { href: "/admin/academics/config", label: "Config" },
          { href: "/admin/academics/publications", label: "Publish", shortLabel: "Publish" }
        ]
      },
      {
        key: "welfare",
        label: "Welfare",
        items: [
          { href: "/admin/welfare/attendance", label: "Attendance", shortLabel: "Attend" },
          { href: "/admin/welfare/incidents", label: "Incidents", shortLabel: "Incid" },
          { href: "/admin/welfare/discipline", label: "Discipline", shortLabel: "Discip" },
          { href: "/admin/welfare/uniform", label: "Uniform", shortLabel: "Uniform" }
        ]
      },
      {
        key: "admissions",
        label: "Admissions",
        items: [{ href: "/admin/applications", label: "Applications", shortLabel: "Apps" }]
      },
      {
        key: "careers",
        label: "Careers",
        items: [
          { href: "/admin/careers", label: "Jobs", shortLabel: "Jobs" },
          { href: "/admin/careers/applications", label: "Applications", shortLabel: "Apps" }
        ]
      },
      {
        key: "operations",
        label: "Operations",
        items: [
          { href: "/admin/exams", label: "Exams" },
          { href: "/admin/finance", label: "Finance" },
          { href: "/admin/audit", label: "Audit log", shortLabel: "Audit" }
        ]
      }
    ];

      if (isAdmin) {
        const core = groups.find((g) => g.key === "core");
        if (core) {
          core.items.splice(1, 0, { href: "/admin/users", label: "Users" });
        }
        return groups;
      }

      return groups
        .map((group) => {
          if (group.key === "operations") {
            return {
              ...group,
              items: group.items.filter((item) => item.href !== "/admin/finance" && item.href !== "/admin/audit")
            };
          }

          return group;
        })
        .filter((group) => group.items.length > 0);
    },
    [isAdmin]
  );

  function findActiveGroupKey() {
    for (const group of navGroups) {
      for (const item of group.items) {
        if (isActivePath(pathname, item.href)) return group.key;
      }
    }
    return "core";
  }

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "1") setCollapsed(true);
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
    setOpenGroups((prev) => {
      const next: Record<string, boolean> = { ...prev };
      for (const g of navGroups) {
        if (typeof next[g.key] !== "boolean") next[g.key] = true;
      }
      next[findActiveGroupKey()] = true;
      return next;
    });
  }, [pathname, navGroups]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMobileOpen(false);
        setProfileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!profileMenuRef.current) return;
      if (!profileMenuRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const sidebarWidthClass = collapsed ? "lg:w-20" : "lg:w-72";
  const contentPaddingClass = collapsed ? "lg:pl-20" : "lg:pl-72";

  function NavLinks({ variant }: { variant: "desktop" | "mobile" }) {
    return (
      <nav className={variant === "desktop" ? "mt-4 space-y-4 text-sm" : "mt-6 space-y-4 text-sm"}>
        {navGroups.map((group) => {
          const isDesktop = variant === "desktop";
          const showGroupHeader = !(collapsed && isDesktop);
          const groupOpen = collapsed && isDesktop ? true : (openGroups[group.key] ?? true);

          return (
            <div key={group.key}>
              {showGroupHeader ? (
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 hover:bg-slate-50"
                  onClick={() => setOpenGroups((v) => ({ ...v, [group.key]: !(v[group.key] ?? true) }))}
                  aria-expanded={groupOpen}
                >
                  <span className="truncate">{group.label}</span>
                  <span className="ml-3 text-sm font-semibold text-slate-400">{groupOpen ? "−" : "+"}</span>
                </button>
              ) : null}

              {groupOpen ? (
                <div className="mt-1 space-y-1">
                  {group.items.map((item) => {
                    const active = isActivePath(pathname, item.href);
                    const label = collapsed && isDesktop ? item.shortLabel ?? item.label : item.label;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={
                          "group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors " +
                          (active
                            ? "bg-slate-900 text-white"
                            : "text-slate-700 hover:bg-slate-50 hover:text-slate-900")
                        }
                        title={collapsed && isDesktop ? item.label : undefined}
                        aria-current={active ? "page" : undefined}
                      >
                        <span
                          className={
                            "inline-flex h-8 w-8 items-center justify-center rounded-lg text-xs font-semibold " +
                            (active
                              ? "bg-white/15 text-white"
                              : "bg-slate-100 text-slate-700 group-hover:bg-slate-200")
                          }
                        >
                          {item.label.slice(0, 1).toUpperCase()}
                        </span>
                        <span className={collapsed && isDesktop ? "hidden" : "truncate"}>{label}</span>
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50 lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              aria-controls="admin-mobile-drawer"
              aria-expanded={mobileOpen}
            >
              <span className="text-lg font-semibold">≡</span>
            </button>

            <Link href="/admin" className="flex items-center gap-2">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-sm font-semibold text-white">
                GF
              </span>
              <span className="hidden text-sm font-semibold text-slate-900 sm:block">Admin</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="hidden h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 lg:inline-flex"
              onClick={() => setCollapsed((v) => !v)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
            >
              {collapsed ? "Expand" : "Collapse"}
            </button>

            <div className="relative" ref={profileMenuRef}>
              <button
                type="button"
                className="inline-flex h-10 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                onClick={() => setProfileOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                <span className="hidden max-w-[220px] truncate sm:block">{userEmail}</span>
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-xs font-semibold text-slate-700">
                  {userEmail.slice(0, 1).toUpperCase()}
                </span>
              </button>

              {profileOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg"
                >
                  <Link
                    role="menuitem"
                    className="block px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                    href="/admin/profile"
                  >
                    Profile
                  </Link>
                  {isAdmin ? (
                    <Link
                      role="menuitem"
                      className="block px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      href="/admin/settings"
                    >
                      Settings
                    </Link>
                  ) : null}
                  <div className="border-t border-slate-200" />
                  <form action="/admin/logout" method="post">
                    <button
                      role="menuitem"
                      className="block w-full px-4 py-3 text-left text-sm font-semibold text-slate-900 hover:bg-slate-50"
                      type="submit"
                    >
                      Logout
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl">
        <aside
          className={
            "fixed inset-y-0 left-0 z-30 hidden border-r border-slate-200 bg-white lg:block " +
            sidebarWidthClass
          }
        >
          <div className={"flex h-full flex-col px-3 py-6 " + (collapsed ? "" : "px-4")}>
            <div className="flex items-center justify-between">
              <div className={"min-w-0 " + (collapsed ? "hidden" : "")}>
                <div className="text-xs font-semibold text-slate-500">Signed in</div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-900">{userEmail}</div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto pr-1">
              <NavLinks variant="desktop" />
            </div>
          </div>
        </aside>

        <div className={"px-4 py-8 sm:px-6 " + contentPaddingClass}>{children}</div>
      </div>

      <div
        className={
          "fixed inset-0 z-50 lg:hidden " +
          (mobileOpen ? "pointer-events-auto" : "pointer-events-none")
        }
        aria-hidden={!mobileOpen}
      >
        <div
          className={
            "absolute inset-0 bg-slate-900/40 transition-opacity duration-200 " +
            (mobileOpen ? "opacity-100" : "opacity-0")
          }
          onClick={() => setMobileOpen(false)}
        />

        <div
          id="admin-mobile-drawer"
          className={
            "absolute inset-y-0 left-0 w-[85%] max-w-[320px] border-r border-slate-200 bg-white shadow-xl transition-transform duration-200 " +
            (mobileOpen ? "translate-x-0" : "-translate-x-full")
          }
          role="dialog"
          aria-modal="true"
        >
          <div className="flex h-full flex-col px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-slate-500">Signed in</div>
                <div className="mt-1 truncate text-sm font-semibold text-slate-900">{userEmail}</div>
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900 hover:bg-slate-50"
                onClick={() => setMobileOpen(false)}
                aria-label="Close menu"
              >
                <span className="text-lg font-semibold">×</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <NavLinks variant="mobile" />
            </div>

            <div className="mt-auto pt-6">
              <form action="/admin/logout" method="post">
                <button
                  className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                  type="submit"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
