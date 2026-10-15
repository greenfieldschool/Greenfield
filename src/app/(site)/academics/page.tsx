import Image from "next/image";
import { BookOpenCheck, GraduationCap, HeartHandshake, Layers, Sprout } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicPageHero, PublicSection, SectionHeading } from "@/components/ui/public-page";
import { schoolPhotos } from "../_lib/media";

const stages = [
  {
    icon: Sprout,
    name: "Creche",
    ages: "Ages 0–4",
    body: "Warm, safe care with early learning routines that build confidence, language, and social development.",
    accent: "from-brand-gold-100 to-brand-gold-50"
  },
  {
    icon: BookOpenCheck,
    name: "Primary",
    ages: "Ages 5–11",
    body: "Strong literacy and numeracy foundations, curiosity-driven learning, and character formation.",
    accent: "from-brand-green-100 to-brand-green-50"
  },
  {
    icon: GraduationCap,
    name: "Secondary",
    ages: "Ages 12–16",
    body: "Subject mastery, critical thinking, leadership, and structured preparation for the next stage.",
    accent: "from-sky-100 to-sky-50"
  }
];

const approach = [
  {
    icon: Layers,
    title: "Curriculum",
    body: "A blended Nigerian + British approach with clear progressions and strong foundations."
  },
  {
    icon: HeartHandshake,
    title: "Learning support",
    body: "Personalized support to help every learner grow with confidence at every stage."
  }
];

export default function AcademicsPage() {
  return (
    <div>
      <PublicPageHero
        eyebrow="Academics"
        title="Strong foundations, high expectations."
        description="A Nigerian + British blended curriculum across Creche, Primary, and Secondary — built on strong foundations, high expectations, and supportive teaching."
      >
        <ButtonLink href="/contact" variant="gold" size="lg">
          Request information
        </ButtonLink>
      </PublicPageHero>

      <PublicSection>
        <SectionHeading eyebrow="Our programmes" title="Three stages of learning" />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {stages.map((s) => (
            <article
              key={s.name}
              className="relative flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-8 shadow-card"
            >
              <div className={`absolute inset-x-0 top-0 h-28 bg-gradient-to-b ${s.accent} opacity-70`} aria-hidden="true" />
              <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-brand-green shadow-card">
                <s.icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="relative mt-6 flex items-baseline justify-between gap-3">
                <h3 className="font-display text-2xl font-semibold text-slate-900">{s.name}</h3>
                <span className="text-sm font-medium text-slate-500">{s.ages}</span>
              </div>
              <p className="relative mt-3 leading-relaxed text-slate-600">{s.body}</p>
            </article>
          ))}
        </div>
      </PublicSection>

      <PublicSection tone="white">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading eyebrow="Our approach" title="How we teach" />
            <div className="mt-10 grid gap-6 sm:grid-cols-2">
              {approach.map((a) => (
                <div key={a.title} className="rounded-2xl border border-slate-200/80 bg-canvas p-6">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                    <a.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-900">{a.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{a.body}</p>
                </div>
              ))}
            </div>
            <ButtonLink href="/contact" variant="primary" size="lg" className="mt-10">
              Request information
            </ButtonLink>
          </div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-3xl">
            <Image
              src={schoolPhotos.art.src}
              alt={schoolPhotos.art.alt}
              fill
              sizes="(min-width: 1024px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
      </PublicSection>
    </div>
  );
}
