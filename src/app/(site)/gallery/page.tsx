import Image from "next/image";
import { PublicPageHero, PublicSection } from "@/components/ui/public-page";
import { schoolPhotos } from "../_lib/media";
import { PhotoRing } from "@/components/three/photo-ring";

const items = [
  { title: "Campus Life", tag: "Campus" },
  { title: "Science Lab", tag: "STEM" },
  { title: "Sports Day", tag: "Sports" },
  { title: "Arts Studio", tag: "Arts" },
  { title: "Library", tag: "Learning" },
  { title: "Clubs", tag: "Community" }
];

type Tile =
  | { kind: "photo"; src: string; alt: string; aspect: string }
  | { kind: "tag"; title: string; tag: string; aspect: string };

// Photos interleaved with the gallery collections, at varied heights for a masonry rhythm.
const tiles: Tile[] = [
  { kind: "photo", ...schoolPhotos.culture, aspect: "aspect-[4/5]" },
  { kind: "tag", ...items[0], aspect: "aspect-[4/3]" },
  { kind: "photo", ...schoolPhotos.art, aspect: "aspect-[4/3]" },
  { kind: "tag", ...items[1], aspect: "aspect-square" },
  { kind: "photo", ...schoolPhotos.campus, aspect: "aspect-square" },
  { kind: "tag", ...items[2], aspect: "aspect-[4/5]" },
  { kind: "tag", ...items[3], aspect: "aspect-[4/3]" },
  { kind: "photo", ...schoolPhotos.entrance, aspect: "aspect-[4/5]" },
  { kind: "tag", ...items[4], aspect: "aspect-square" },
  { kind: "tag", ...items[5], aspect: "aspect-[4/3]" }
];

export default function GalleryPage() {
  return (
    <div>
      <PublicPageHero eyebrow="Gallery" title="Gallery" description="A preview of student life and campus experiences." />

      <PublicSection>
        <PhotoRing
          className="mb-12"
          photos={Object.values(schoolPhotos).map((p) => ({
            // Same-origin, resized copy from Next's image optimiser keeps the 3D textures light.
            src: `/_next/image?url=${encodeURIComponent(p.src)}&w=1080&q=70`,
            alt: p.alt
          }))}
        />

        <div className="columns-1 gap-6 sm:columns-2 lg:columns-3">
          {tiles.map((t) =>
            t.kind === "photo" ? (
              <figure key={t.src} className={`group relative mb-6 break-inside-avoid overflow-hidden rounded-3xl bg-slate-200 ${t.aspect}`}>
                <Image
                  src={t.src}
                  alt={t.alt}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover transition duration-700 group-hover:scale-105"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent transition sm:opacity-0 sm:group-hover:opacity-100"
                  aria-hidden="true"
                />
                <figcaption className="absolute bottom-4 left-4 right-4 text-sm font-medium text-white transition sm:translate-y-2 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100">
                  {t.alt}
                </figcaption>
              </figure>
            ) : (
              <figure
                key={t.title}
                className={`group relative mb-6 flex break-inside-avoid flex-col justify-end overflow-hidden rounded-3xl bg-brand-green-900 p-6 ${t.aspect}`}
              >
                <div
                  className="absolute inset-0 bg-[linear-gradient(135deg,rgba(11,61,46,0.9),rgba(212,160,23,0.45))] transition duration-700 group-hover:scale-105"
                  aria-hidden="true"
                />
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-gold/20 blur-2xl" aria-hidden="true" />
                <figcaption className="relative">
                  <span className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold text-white backdrop-blur">
                    {t.tag}
                  </span>
                  <span className="mt-3 block font-display text-2xl font-semibold text-white">{t.title}</span>
                </figcaption>
              </figure>
            )
          )}
        </div>
      </PublicSection>
    </div>
  );
}
