import type { LucideIcon } from "lucide-react";
import { Mail, MapPin, MessageCircle, Phone } from "lucide-react";
import { InquiryForm } from "@/components/inquiry-form";
import { PublicPageHero, PublicSection } from "@/components/ui/public-page";
import { school } from "@/lib/school";

type ContactItem = { icon: LucideIcon; label: string; value: string; href?: string; external?: boolean };

const contacts: ContactItem[] = [
  { icon: Phone, label: "Phone", value: school.phone, href: `tel:${school.phone}` },
  { icon: Mail, label: "Email", value: school.email, href: `mailto:${school.email}` },
  { icon: MessageCircle, label: "WhatsApp", value: "Chat with us on WhatsApp", href: "https://wa.me/2349060010300", external: true },
  { icon: MapPin, label: "Address", value: school.address }
];

export default function ContactPage() {
  return (
    <div>
      <PublicPageHero
        eyebrow="Contact"
        title="We’d love to hear from you."
        description="Request information, book a visit, or ask a question. We’ll respond as soon as possible."
      />

      <PublicSection>
        <div className="grid gap-10 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <h2 className="font-display text-3xl font-semibold text-slate-900">Get in touch</h2>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              {contacts.map((c) => {
                const body = (
                  <>
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                      <c.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-medium text-slate-500">{c.label}</span>
                      <span className="block break-words font-semibold text-slate-900">{c.value}</span>
                    </span>
                  </>
                );
                const cls =
                  "flex items-center gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card transition";
                return (
                  <li key={c.label}>
                    {c.href ? (
                      <a
                        href={c.href}
                        target={c.external ? "_blank" : undefined}
                        rel={c.external ? "noreferrer" : undefined}
                        className={cls + " hover:border-brand-green-200 hover:shadow-lift"}
                      >
                        {body}
                      </a>
                    ) : (
                      <div className={cls}>{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-card sm:p-10 lg:col-span-3">
            <h2 className="font-display text-2xl font-semibold text-slate-900">Send an inquiry</h2>
            <p className="mb-6 mt-1 text-sm text-slate-500">Our admissions team will contact you.</p>
            <InquiryForm />
          </div>
        </div>
      </PublicSection>
    </div>
  );
}
