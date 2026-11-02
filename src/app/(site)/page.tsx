import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  ClipboardList,
  HeartHandshake,
  Mail,
  Phone,
  Sparkles,
  Trophy,
  Users
} from "lucide-react";
import { InquiryForm } from "@/components/inquiry-form";
import { buttonClasses } from "@/components/ui/button";
import { HeroBloom } from "@/components/three/hero-bloom";
import { StagesGrowth } from "@/components/three/stages-growth";
import { CountUp } from "@/components/motion/count-up";
import { Reveal, Stagger, StaggerItem } from "@/components/motion/reveal";
import { ExpandOnScroll, Parallax, ScrollHighlight, ScrollLine, ScrollMarquee, ToneBackdrop } from "@/components/motion/scroll";
import { BrushUnderline, TextReveal, riseDelay } from "@/components/motion/text-reveal";
import { Tilt } from "@/components/motion/tilt";
import { Magnetic } from "@/components/motion/cursor";
import { school } from "@/lib/school";

const media = "https://sxujllqkkrwkqslmbgpc.supabase.co/storage/v1/object/public/media";

const heroImages = [
  {
    src: `${media}/20230524-FulaniCulture-2.jpg`,
    alt: "Students celebrating culture at Greenfield School"
  },
  {
    src: `${media}/Entrace%20International%20Anti-Corruption%20Day%202017-2.JPG`,
    alt: "School entrance during an event"
  },
  {
    src: `${media}/IMG_20211127_114635_936-2.jpg`,
    alt: "Students and staff on campus"
  },
  {
    src: `${media}/Mr%20Teslim%20Explaining%20the%20wall%20Paintings1-2.JPG`,
    alt: "Teacher explaining student artwork"
  }
];

const facts = [
  { value: "12:1", label: "Student–teacher ratio" },
  { value: "30+", label: "Clubs & societies" },
  { value: "10+", label: "Sports & athletics" },
  { value: "3", label: "Stages, creche to secondary" }
];

const pillars = [
  {
    icon: Sparkles,
    title: "Nigerian + British curriculum",
    body: "A blended approach with clear progressions, rooted at home and ready for the world."
  },
  {
    icon: Users,
    title: "Small classes",
    body: "Around twelve learners per teacher, so every child is known, stretched and supported."
  },
  {
    icon: HeartHandshake,
    title: "Personalised learning support",
    body: "Help for every learner to grow with confidence at every stage."
  },
  {
    icon: Trophy,
    title: "Clubs, sports & leadership",
    body: "30+ clubs and societies and 10+ sports, plus mentoring and responsibility in secondary."
  }
];

const steps = [
  {
    icon: Mail,
    title: "Request information",
    body: "We share programme details and answer your questions."
  },
  {
    icon: CalendarCheck,
    title: "Visit the campus",
    body: "Tour the facilities and meet our teachers and community."
  },
  {
    icon: ClipboardList,
    title: "Apply online",
    body: "A guided application, with support from start to finish."
  }
];

const mission =
  "Our mission is to develop confident learners with strong values and global readiness — guided by integrity, curiosity, excellence, service and respect.";

export default function HomePage() {
  return (
    <div>
      {/* The page colour shifts as each section (data-tone) reaches the middle of the screen. */}
      <ToneBackdrop initial="cream" />
      {/* ── Hero: a bud opens into full bloom as you scroll ── */}
      <HeroBloom
        photos={heroImages}
        closing={
          <p className="max-w-md font-display text-3xl font-semibold leading-tight text-white sm:text-4xl lg:text-5xl">
            Every child starts somewhere. <span className="italic text-brand-gold-300">Here, they flourish.</span>
          </p>
        }
      >
        {/* Arrival: the eyebrow, then the headline word by word, a gold stroke under "grows.", then the rest. */}
        <div className="max-w-2xl">
          <div
            className="gf-rise inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur"
            style={riseDelay(0)}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-brand-gold" aria-hidden="true" />
            Creche · Primary · Secondary — Lekki, Lagos
          </div>
          <h1 className="mt-6 font-display text-[2.75rem] font-semibold leading-[1.02] text-white sm:text-7xl lg:text-8xl">
            <TextReveal text="Where excellence" delay={150} step={90} />{" "}
            <span className="relative inline-block text-brand-gold-300">
              <TextReveal text="grows." className="italic" start={2} delay={150} step={90} />
              <BrushUnderline delay={650} className="text-brand-gold/70" />
            </span>
          </h1>
          <p className="gf-rise mt-6 max-w-xl text-lg leading-relaxed text-brand-green-100" style={riseDelay(550)}>
            A Nigerian + British blended curriculum that supports every learner from the early years to secondary school
            — with strong foundations, high standards and outstanding care.
          </p>
          <div className="gf-rise mt-9 flex flex-wrap gap-3" style={riseDelay(700)}>
            <Magnetic>
              <Link href="/contact" className={buttonClasses({ variant: "gold", size: "lg" })}>
                Book a visit
              </Link>
            </Magnetic>
            <Magnetic>
              <Link href="/admissions" className={buttonClasses({ variant: "inverse", size: "lg", className: "group" })}>
                Admissions
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </Magnetic>
          </div>
        </div>
      </HeroBloom>

      {/* ── Facts strip, overlapping the hero ── */}
      <section data-tone="cream" className="relative z-10 mx-auto -mt-20 max-w-7xl px-6 sm:-mt-24">
        <Stagger
          className="gf-rise grid grid-cols-2 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-lift lg:grid-cols-4"
          gap={0.12}
        >
          {facts.map((f, i) => (
            <StaggerItem
              key={f.label}
              className={
                "px-6 py-7 sm:px-8 " +
                (i % 2 === 1 ? "border-l border-slate-100 " : "") +
                (i >= 2 ? "border-t border-slate-100 lg:border-t-0 " : "") +
                (i === 2 ? "lg:border-l " : "")
              }
            >
              <CountUp value={f.value} className="block font-display text-4xl font-semibold text-brand-green" />
              <div className="mt-1 text-sm text-slate-600">{f.label}</div>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── Stages ── */}
      <section data-tone="cream" className="mx-auto max-w-7xl px-6 py-24">
        <Reveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">Our programmes</div>
            <h2 className="mt-3 font-display text-4xl font-semibold text-slate-900 sm:text-5xl">
              Three stages. One standard of excellence.
            </h2>
          </div>
          <Link
            href="/academics"
            className="group inline-flex items-center gap-2 text-sm font-semibold text-brand-green"
          >
            Explore academics
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </Reveal>

        <div className="mt-12">
          <StagesGrowth />
        </div>
      </section>

      {/* ── The values band: giant sliding type, a photo that grows to fill the screen, the mission lighting up ── */}
      <section data-tone="deep" className="text-brand-gold-300">
        <ScrollMarquee words={["Deep roots", "Bright futures", "Strong values", "Global readiness"]} />
        <ExpandOnScroll media={<Image src={heroImages[0].src} alt={heroImages[0].alt} fill sizes="100vw" className="object-cover" />}>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-300">Life at Greenfield</div>
          <p className="mt-3 max-w-2xl font-display text-4xl font-semibold leading-tight text-white sm:text-6xl">
            Rooted at home. <span className="italic text-brand-gold-300">Ready for the world.</span>
          </p>
        </ExpandOnScroll>
        <div className="mx-auto max-w-5xl px-6 py-24 sm:py-32">
          <ScrollHighlight
            text={mission}
            className="font-display text-3xl font-semibold leading-snug text-brand-green-50 sm:text-5xl sm:leading-tight"
          />
        </div>
      </section>

      {/* ── Why Greenfield ── */}
      <section data-tone="mist">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 py-24 lg:grid-cols-2 lg:items-center">
          <div className="relative">
            <div className="grid grid-cols-2 gap-4">
              <Parallax distance={30}>
                <Reveal variant="mask" className="relative aspect-[3/4] overflow-hidden rounded-3xl">
                  <Image
                    src={heroImages[3].src}
                    alt={heroImages[3].alt}
                    fill
                    sizes="(min-width: 1024px) 25vw, 50vw"
                    className="object-cover"
                  />
                </Reveal>
              </Parallax>
              <Parallax distance={70} className="mt-12 space-y-4">
                <Reveal variant="mask" delay={0.15} className="relative aspect-square overflow-hidden rounded-3xl">
                  <Image
                    src={heroImages[2].src}
                    alt={heroImages[2].alt}
                    fill
                    sizes="(min-width: 1024px) 25vw, 50vw"
                    className="object-cover"
                  />
                </Reveal>
                <Reveal variant="scale" delay={0.3} className="rounded-3xl bg-brand-green p-6 text-white">
                  <div className="font-display text-3xl font-semibold text-brand-gold-300">Deep roots.</div>
                  <div className="font-display text-3xl font-semibold">Bright futures.</div>
                </Reveal>
              </Parallax>
            </div>
          </div>

          <Reveal>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">Why Greenfield</div>
            <h2 className="mt-3 font-display text-4xl font-semibold text-slate-900 sm:text-5xl">
              Confident learners with strong values.
            </h2>
            <Stagger className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2" delay={0.2}>
              {pillars.map((p) => (
                <StaggerItem key={p.title} className="group">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                    <p.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-900">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.body}</p>
                </StaggerItem>
              ))}
            </Stagger>
            <Link
              href="/about"
              className={buttonClasses({
                variant: "secondary",
                size: "lg",
                className: "mt-10"
              })}
            >
              About Greenfield
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── Admissions steps ── */}
      <section data-tone="cream" className="mx-auto max-w-7xl px-6 py-24">
        <Reveal variant="scale" className="overflow-hidden rounded-[2rem] bg-brand-green-900 text-white">
          <div className="grid gap-12 p-8 sm:p-12 lg:grid-cols-5 lg:p-16">
            <div className="lg:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-300">Admissions</div>
              <h2 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Admissions made simple.</h2>
              <p className="mt-5 text-brand-green-100">
                Explore how Greenfield can support your child&apos;s growth. We&apos;ll guide you to the right entry
                point for creche, primary or secondary.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Magnetic>
                  <Link href="/apply" className={buttonClasses({ variant: "gold", size: "lg" })}>
                    Start an application
                  </Link>
                </Magnetic>
                <Link href="/admissions" className={buttonClasses({ variant: "inverse", size: "lg" })}>
                  How it works
                </Link>
              </div>
            </div>
            <div className="relative lg:col-span-3">
              {/* A gold line joins the steps, drawing down as you scroll. */}
              <ScrollLine className="bottom-12 left-[2.875rem] top-12" />
              <Stagger as="ol" className="relative grid gap-4" gap={0.15} delay={0.2}>
                {steps.map((s, i) => (
                  <StaggerItem
                    as="li"
                    variant="right"
                    key={s.title}
                    className="relative flex gap-5 rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-sm"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gold text-brand-green-950">
                      <s.icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-brand-gold-300">
                        Step {i + 1}
                      </div>
                      <div className="mt-1 text-lg font-semibold">{s.title}</div>
                      <p className="mt-1 text-sm text-brand-green-100">{s.body}</p>
                    </div>
                  </StaggerItem>
                ))}
              </Stagger>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Life at Greenfield ── */}
      <section data-tone="warm" className="mx-auto max-w-7xl px-6 pb-24 pt-24">
        <Reveal className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">
              Life at Greenfield
            </div>
            <h2 className="mt-3 font-display text-4xl font-semibold text-slate-900 sm:text-5xl">
              Culture, creativity and community.
            </h2>
          </div>
          <Link href="/gallery" className="group inline-flex items-center gap-2 text-sm font-semibold text-brand-green">
            View the gallery
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </Reveal>
        <Stagger
          className="mt-10 grid auto-rows-[180px] grid-cols-2 gap-4 sm:auto-rows-[220px] lg:grid-cols-4"
          gap={0.12}
        >
          {heroImages.map((img, i) => (
            <StaggerItem
              variant="mask"
              key={img.src}
              className={i === 0 ? "col-span-2 row-span-2" : i === 3 ? "col-span-2" : ""}
            >
              <Tilt max={5} className="h-full overflow-hidden rounded-3xl">
                <Image
                  src={img.src}
                  alt={img.alt}
                  fill
                  sizes="(min-width: 1024px) 50vw, 100vw"
                  className="object-cover transition duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent transition can-hover:opacity-0 can-hover:group-hover:opacity-100" />
                <span className="absolute bottom-4 left-4 right-4 text-sm font-medium text-white transition can-hover:translate-y-2 can-hover:opacity-0 can-hover:group-hover:translate-y-0 can-hover:group-hover:opacity-100">
                  {img.alt}
                </span>
              </Tilt>
            </StaggerItem>
          ))}
        </Stagger>
      </section>

      {/* ── Contact ── */}
      <section id="enquire" data-tone="white">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-2">
          <Reveal>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">Get in touch</div>
            <h2 className="mt-3 font-display text-4xl font-semibold text-slate-900 sm:text-5xl">
              We&apos;d love to hear from you.
            </h2>
            <p className="mt-5 max-w-lg text-lg text-slate-600">
              Tell us a little about your child and what you&apos;re looking for. Our admissions team will get back to
              you.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <a
                href={`tel:${school.phone}`}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 p-5 transition hover:border-brand-green-200 hover:bg-brand-green-50/40"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                  <Phone className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-xs font-medium text-slate-500">Call us</span>
                  <span className="block font-semibold text-slate-900">{school.phone}</span>
                </span>
              </a>
              <a
                href={`mailto:${school.email}`}
                className="group flex items-center gap-4 rounded-2xl border border-slate-200 p-5 transition hover:border-brand-green-200 hover:bg-brand-green-50/40"
              >
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                  <Mail className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-medium text-slate-500">Email us</span>
                  <span className="block truncate font-semibold text-slate-900">{school.email}</span>
                </span>
              </a>
            </div>
          </Reveal>
          <Reveal variant="scale" delay={0.1} className="rounded-3xl border border-slate-200/80 bg-canvas p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900">Send an enquiry</h3>
            <p className="mb-6 mt-1 text-sm text-slate-500">Our admissions team will contact you.</p>
            <InquiryForm />
          </Reveal>
        </div>
      </section>
    </div>
  );
}
