import Link from "next/link";

const nav = [
  { href: "#admissions", label: "Admissions" },
  { href: "#contact", label: "Contact" },
  { href: "/", label: "News" }
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
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
            href="#contact"
            className="inline-flex items-center justify-center rounded-xl bg-brand-gold px-4 py-2 text-sm font-semibold text-slate-900 hover:brightness-95"
          >
            Book a Visit
          </Link>
        </nav>
        <Link
          href="#contact"
          className="md:hidden inline-flex items-center justify-center rounded-xl bg-brand-gold px-4 py-2 text-sm font-semibold text-slate-900 hover:brightness-95"
        >
          Visit
        </Link>
      </div>
    </header>
  );
}
