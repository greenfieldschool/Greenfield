import Image from "next/image";
import { ArrowRight, Baby, Palette, Users } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { PublicPageHero, PublicSection, SectionHeading } from "@/components/ui/public-page";
import { schoolPhotos } from "../_lib/media";

const highlights = [
  {
    icon: Baby,
    title: "Creche care & routines",
    body: "Warm supervision, play, and early learning routines that support healthy development."
  },
  {
    icon: Palette,
    title: "Primary clubs & enrichment",
    body: "Confidence-building clubs, creativity, sports, and a strong reading culture."
  },
  {
    icon: Users,
    title: "Secondary leadership",
    body: "Societies, mentoring, responsibility, and healthy competition that builds character."
  }
];

const photos = [schoolPhotos.culture, schoolPhotos.art, schoolPhotos.campus, schoolPhotos.entrance];

export default function StudentLifePage() {
  return (
    <div>
      <PublicPageHero
        eyebrow="Student life"
        title="Culture, creativity and community."
        description="A caring environment for Creche, a vibrant experience for Primary, and a purposeful community for Secondary — with clubs, sports, arts, and leadership."
      >
        <ButtonLink href="/events" variant="gold" size="lg">
          View upcoming events
        </ButtonLink>
        <ButtonLink href="/gallery" variant="inverse" size="lg">
          Gallery
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </ButtonLink>
      </PublicPageHero>

      <PublicSection>
        <SectionHeading eyebrow="At every stage" title="Growing beyond the classroom" />
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {highlights.map((h) => (
            <article key={h.title} className="rounded-3xl border border-slate-200/80 bg-white p-8 shadow-card">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-green-50 text-brand-green-600">
                <h.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-6 font-display text-xl font-semibold text-slate-900">{h.title}</h3>
              <p className="mt-2 leading-relaxed text-slate-600">{h.body}</p>
            </article>
          ))}
        </div>
      </PublicSection>

      <PublicSection tone="white">
        <div className="grid auto-rows-[180px] grid-cols-2 gap-4 sm:auto-rows-[220px] lg:grid-cols-4">
          {photos.map((img, i) => (
            <div
              key={img.src}
              className={"group relative overflow-hidden rounded-3xl " + (i === 0 ? "col-span-2 row-span-2" : i === 3 ? "col-span-2" : "")}
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover transition duration-700 group-hover:scale-105"
              />
            </div>
          ))}
        </div>
        <div className="mt-10 flex justify-center">
          <ButtonLink href="/events" variant="primary" size="lg">
            View upcoming events
          </ButtonLink>
        </div>
      </PublicSection>
    </div>
  );
}
