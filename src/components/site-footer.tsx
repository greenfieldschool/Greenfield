import Link from "next/link";
import { ArrowUpRight, Mail, MapPin, Phone } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { buttonClasses } from "@/components/ui/button";
import { school } from "@/lib/school";
import { WHATSAPP_URL } from "@/components/whatsapp-button";

const columns = [
  {
    title: "Explore",
    links: [
      { href: "/about", label: "About us" },
      { href: "/academics", label: "Academics" },
      { href: "/student-life", label: "Student life" },
      { href: "/gallery", label: "Gallery" },
      { href: "/news", label: "News" },
      { href: "/events", label: "Events" }
    ]
  },
  {
    title: "Admissions",
    links: [
      { href: "/admissions", label: "How to apply" },
      { href: "/apply", label: "Start an application" },
      { href: "/contact", label: "Book a visit" },
      { href: "/careers", label: "Careers" }
    ]
  },
  {
    title: "Portals",
    links: [
      { href: "/portal/login", label: "Parent & student portal" },
      { href: "/admin/login", label: "Staff dashboard" }
    ]
  }
];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden bg-brand-green-950 text-brand-green-100">
      <div
        className="pointer-events-none absolute -right-40 -top-40 h-[28rem] w-[28rem] rounded-full bg-brand-gold/10 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative mx-auto max-w-7xl px-6 pb-10 pt-16">
        {/* CTA */}
        <div className="flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.04] p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="font-display text-3xl font-semibold text-white sm:text-4xl">Come and see Greenfield.</h2>
            <p className="mt-2 max-w-xl text-brand-green-200">
              Tour the campus, meet our teachers and find the right class for your child.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/contact" className={buttonClasses({ variant: "gold", size: "lg" })}>
              Book a visit
            </Link>
            <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className={buttonClasses({ variant: "inverse", size: "lg" })}>
              Chat on WhatsApp
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
          </div>
        </div>

        <div className="mt-14 grid gap-10 md:grid-cols-2 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <Logo inverted />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-brand-green-200">
              Deep roots. Bright futures. A Nigerian + British blended education from creche to secondary.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex items-start gap-3">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand-gold" aria-hidden="true" />
                <span>{school.address}</span>
              </li>
              <li>
                <a href={`tel:${school.phone}`} className="flex items-center gap-3 hover:text-white">
                  <Phone className="h-4 w-4 shrink-0 text-brand-gold" aria-hidden="true" />
                  {school.phone}
                </a>
              </li>
              <li>
                <a href={`mailto:${school.email}`} className="flex items-center gap-3 hover:text-white">
                  <Mail className="h-4 w-4 shrink-0 text-brand-gold" aria-hidden="true" />
                  {school.email}
                </a>
              </li>
            </ul>
          </div>

          {columns.map((col, i) => (
            <div key={col.title} className={i === 0 ? "lg:col-span-2 lg:col-start-6" : "lg:col-span-2"}>
              <h3 className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-gold-300">{col.title}</h3>
              <ul className="mt-4 space-y-2.5 text-sm">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="text-brand-green-100 transition hover:text-white">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-6 text-xs text-brand-green-300 sm:flex-row sm:items-center sm:justify-between">
          <div>© {year} Greenfield School. All rights reserved.</div>
          <div className="flex gap-5">
            <Link className="hover:text-white" href="/privacy">
              Privacy
            </Link>
            <Link className="hover:text-white" href="/terms">
              Terms
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
