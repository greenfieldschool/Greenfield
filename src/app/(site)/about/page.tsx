import Image from "next/image";
import { ArrowRight, Compass, Gem, School } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicPageHero, PublicSection, SectionHeading } from "@/components/ui/public-page";
import { schoolPhotos } from "../_lib/media";

const pillars = [
  {
    icon: Compass,
    title: "Mission",
    body: "To develop confident learners with strong values and global readiness from early years to secondary school."
  },
  {
    icon: Gem,
    title: "Values",
    body: "Integrity, curiosity, excellence, service, and respect."
  },
  {
    icon: School,
    title: "Our school",
    body: "Creche (0–4), Primary (5–11), and Secondary (12–16) in a safe, inclusive environment."
  }
];

export default function AboutPage() {
  return (
    <div>
      <PublicPageHero
        eyebrow="About us"
        title="About Greenfield"
        description="Greenfield School serves families across Creche, Primary, and Secondary with a Nigerian + British blended curriculum, strong values, and outstanding care."
      >
        <ButtonLink href="/academics" variant="gold" size="lg">
          Explore academics
        </ButtonLink>
        <ButtonLink href="/admissions" variant="inverse" size="lg">
          Admissions
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </ButtonLink>
      </PublicPageHero>

      <PublicSection>
        <div className="grid gap-14 lg:grid-cols-2 lg:items-center">
          <div className="grid grid-cols-2 gap-4">
            <div className="relative aspect-[3/4] overflow-hidden rounded-3xl">
              <Image
                src={schoolPhotos.campus.src}
                alt={schoolPhotos.campus.alt}
                fill
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="relative mt-12 aspect-[3/4] overflow-hidden rounded-3xl">
              <Image
                src={schoolPhotos.culture.src}
                alt={schoolPhotos.culture.alt}
                fill
                sizes="(min-width: 1024px) 25vw, 50vw"
                className="object-cover"
              />
            </div>
          </div>

          <div>
            <SectionHeading eyebrow="Who we are" title="What guides us" />
            <ul className="mt-10 space-y-8">
              {pillars.map((p) => (
                <li key={p.title} className="flex gap-5">
                  <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-green-50 text-brand-green-600">
                    <p.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="font-display text-xl font-semibold text-slate-900">{p.title}</h3>
                    <p className="mt-1.5 leading-relaxed text-slate-600">{p.body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </PublicSection>

      <PublicSection tone="white">
        <div className="flex flex-col items-start justify-between gap-8 rounded-[2rem] bg-brand-green-900 p-8 text-white sm:p-12 lg:flex-row lg:items-center">
          <div className="max-w-xl">
            <h2 className="font-display text-3xl font-semibold sm:text-4xl">Discover the Greenfield journey.</h2>
            <p className="mt-3 text-brand-green-100">From creche to secondary, see how we support every stage.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href="/academics" variant="gold" size="lg">
              Explore academics
            </ButtonLink>
            <ButtonLink href="/admissions" variant="inverse" size="lg">
              Admissions
            </ButtonLink>
          </div>
        </div>
      </PublicSection>
    </div>
  );
}
