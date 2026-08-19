"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

export default function PortalHeaderClient({
  displayName,
  displayEmail,
  initials,
  role,
  studentNavItems,
  parentNavItems
}: {
  displayName: string;
  displayEmail: string;
  initials: string;
  role: string;
  studentNavItems: NavItem[];
  parentNavItems: NavItem[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const navItems = role === "student" ? studentNavItems : parentNavItems;

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  return (
    <>
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Burger Button - Mobile Only */}
            <button
              onClick={toggleMenu}
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-900 active:scale-95 transition-all lg:hidden"
              aria-label="Toggle menu"
            >
              {isOpen ? (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>

            {/* Logo */}
            <Link href="/portal" className="flex items-center gap-2.5" onClick={closeMenu}>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-green shadow-sm">
                <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <span className="text-sm font-bold text-slate-900">Greenfield Portal</span>
              </div>
            </Link>
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <div className="max-w-[160px] truncate text-xs font-semibold text-slate-800">{displayName}</div>
              <div className="max-w-[160px] truncate text-[10px] text-slate-400">{displayEmail}</div>
            </div>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-green text-xs font-bold text-white ring-2 ring-brand-green/20">
              {initials}
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div
          onClick={closeMenu}
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300 lg:hidden"
        />
      )}

      {/* Mobile Side Drawer Menu */}
      <div
        className={`fixed bottom-0 top-[53px] left-0 z-40 w-72 transform bg-white border-r border-slate-200 p-5 shadow-2xl transition-transform duration-300 ease-out lg:hidden ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* User Card */}
        <div className="mb-6 rounded-2xl bg-slate-50 p-4 border border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-green text-sm font-bold text-white shadow-inner">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-slate-900">{displayName}</div>
              <div className="truncate text-xs text-slate-500">{displayEmail}</div>
            </div>
          </div>
          <div className="mt-2.5 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-800 border border-emerald-100">
            {role === "student" ? "Student Account" : "Parent / Guardian"}
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenu}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-brand-green text-white shadow-md shadow-brand-green/20"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <svg
                  className={`h-5 w-5 shrink-0 ${isActive ? "text-white" : "text-slate-400"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Drawer Actions */}
        <div className="absolute bottom-5 left-5 right-5 border-t border-slate-100 pt-4">
          <form action="/portal/logout" method="post">
            <button
              type="submit"
              className="flex w-full items-center justify-center gap-2.5 rounded-xl bg-red-50 py-3 text-sm font-semibold text-red-600 active:scale-95 transition-all hover:bg-red-100"
            >
              <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
