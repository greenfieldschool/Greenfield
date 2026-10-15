import { CalendarCheck, Check, ClipboardList, Mail } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicPageHero, PublicSection, SectionHeading } from "@/components/ui/public-page";

const steps = [
  { icon: Mail, title: "Request information", text: "Get program details and admissions guidance." },
  { icon: CalendarCheck, title: "Visit campus", text: "Tour the school and meet the team." },
  { icon: ClipboardList, title: "Apply", text: "Submit your application with our support." }
];

const checklist = ["Student information", "Previous records (if available)", "Parent/guardian contact details"];

export default function AdmissionsPage() {
  return (
    <div>
      <PublicPageHero
        eyebrow="Admissions"
        title="Admissions made simple."
        description="A clear, supportive process for Creche (0–4), Primary (5–11), and Secondary (12–16) — helping families make confident decisions."
      >
        <ButtonLink href="/apply" variant="gold" size="lg">
          Start application
        </ButtonLink>
        <ButtonLink href="/contact" variant="inverse" size="lg">
          Book a visit
        </ButtonLink>
      </PublicPageHero>

      <PublicSection>
        <SectionHeading eyebrow="How it works" title="Three simple steps" />
        <ol className="mt-12 grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <li key={s.title} className="relative rounded-3xl border border-slate-200/80 bg-white p-8 shadow-card">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold text-brand-green-950">
                  <s.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="font-display text-5xl font-semibold text-brand-green-100" aria-hidden="true">
                  {i + 1}
                </span>
              </div>
              <div className="mt-6 text-xs font-semibold uppercase tracking-wider text-brand-gold-700">Step {i + 1}</div>
              <h3 className="mt-1 font-display text-2xl font-semibold text-slate-900">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </PublicSection>

      <PublicSection tone="white">
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-3xl border border-slate-200/80 bg-canvas p-8 sm:p-10">
            <h2 className="font-display text-3xl font-semibold text-slate-900">What you’ll need</h2>
            <ul className="mt-6 space-y-4">
              {checklist.map((item) => (
                <li key={item} className="flex items-start gap-3 text-slate-700">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-green-50 text-brand-green-600">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl bg-brand-green-900 p-8 text-white sm:p-10">
            <h2 className="font-display text-3xl font-semibold">Next step</h2>
            <p className="mt-4 leading-relaxed text-brand-green-100">
              Start by requesting information or booking a visit. We’ll guide you to the right entry point for
              Creche, Primary, or Secondary.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/apply" variant="gold" size="lg">
                Start application
              </ButtonLink>
              <ButtonLink href="/contact" variant="inverse" size="lg">
                Book a visit
              </ButtonLink>
              <ButtonLink href="/contact" variant="inverse" size="lg">
                Request info
              </ButtonLink>
            </div>
          </div>
        </div>
      </PublicSection>
    </div>
  );
}
