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
import { HeroRotator } from "@/components/hero-rotator";
import { buttonClasses } from "@/components/ui/button";
import { HeroLeaves } from "@/components/three/hero-leaves";
import { StagesGrowth } from "@/components/three/stages-growth";
import { CountUp } from "@/components/motion/count-up";
import { Reveal } from "@/components/motion/reveal";
import { school } from "@/lib/school";

const media = "https://sxujllqkkrwkqslmbgpc.supabase.co/storage/v1/object/public/media";

const heroImages = [
  { src: `${media}/20230524-FulaniCulture-2.jpg`, alt: "Students celebrating culture at Greenfield School" },
  { src: `${media}/Entrace%20International%20Anti-Corruption%20Day%202017-2.JPG`, alt: "School entrance during an event" },
  { src: `${media}/IMG_20211127_114635_936-2.jpg`, alt: "Students and staff on campus" },
  { src: `${media}/Mr%20Teslim%20Explaining%20the%20wall%20Paintings1-2.JPG`, alt: "Teacher explaining student artwork" }
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
  { icon: Mail, title: "Request information", body: "We share programme details and answer your questions." },
  { icon: CalendarCheck, title: "Visit the campus", body: "Tour the facilities and meet our teachers and community." },
  { icon: ClipboardList, title: "Apply online", body: "A guided application, with support from start to finish." }
];

export default function HomePage() {
  return (
    <div>
      {/* ── Hero ── */}
      <section className="relative isolate overflow-hidden bg-brand-green-950">
        <HeroRotator className="absolute inset-0 -z-10" images={heroImages} />
        <HeroLeaves className="absolute inset-0 -z-[5]" />
        <div className="mx-auto max-w-7xl px-6 pb-36 pt-20 sm:pb-44 sm:pt-28 lg:pt-32">
          <div className="max-w-2xl animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3.5 py-1.5 text-xs font-medium text-white backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-gold" aria-hidden="true" />
              Creche · Primary · Secondary — Lekki, Lagos
            </div>
            <h1 className="mt-6 font-display text-[2.6rem] font-semibold leading-[1.05] text-white sm:text-6xl lg:text-7xl">
              Where excellence <span className="italic text-brand-gold-300">grows.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-brand-green-100">
              A Nigerian + British blended curriculum that supports every learner from the early years to
              secondary school — with strong foundations, high standards and outstanding care.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/contact" className={buttonClasses({ variant: "gold", size: "lg" })}>
                Book a visit
              </Link>
              <Link href="/admissions" className={buttonClasses({ variant: "inverse", size: "lg" })}>
                Admissions
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Facts strip, overlapping the hero ── */}
      <section className="relative z-10 mx-auto -mt-20 max-w-7xl px-6 sm:-mt-24">
        <div className="grid grid-cols-2 overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-lift lg:grid-cols-4">
          {facts.map((f, i) => (
            <div
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
            </div>
          ))}
        </div>
      </section>

      {/* ── Stages ── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">Our programmes</div>
            <h2 className="mt-3 font-display text-4xl font-semibold text-slate-900 sm:text-5xl">
              Three stages. One standard of excellence.
            </h2>
          </div>
          <Link href="/academics" className="group inline-flex items-center gap-2 text-sm font-semibold text-brand-green">
            Explore academics
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>

        <div className="mt-12">
          <StagesGrowth />
        </div>
      </section>

      {/* ── Why Greenfield ── */}
      <section className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-14 px-6 py-24 lg:grid-cols-2 lg:items-center">
          <div className="relative">
            <div className="grid grid-cols-2 gap-4">
              <div className="relative aspect-[3/4] overflow-hidden rounded-3xl">
                <Image src={heroImages[3].src} alt={heroImages[3].alt} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" />
              </div>
              <div className="mt-12 space-y-4">
                <div className="relative aspect-square overflow-hidden rounded-3xl">
                  <Image src={heroImages[2].src} alt={heroImages[2].alt} fill sizes="(min-width: 1024px) 25vw, 50vw" className="object-cover" />
                </div>
                <div className="rounded-3xl bg-brand-green p-6 text-white">
                  <div className="font-display text-3xl font-semibold text-brand-gold-300">Deep roots.</div>
                  <div className="font-display text-3xl font-semibold">Bright futures.</div>
                </div>
              </div>
            </div>
          </div>

          <Reveal>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">Why Greenfield</div>
            <h2 className="mt-3 font-display text-4xl font-semibold text-slate-900 sm:text-5xl">
              Confident learners with strong values.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-slate-600">
              Our mission is to develop confident learners with strong values and global readiness — guided by
              integrity, curiosity, excellence, service and respect.
            </p>
            <div className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2">
              {pillars.map((p) => (
                <div key={p.title}>
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                    <p.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 font-semibold text-slate-900">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{p.body}</p>
                </div>
              ))}
            </div>
            <Link href="/about" className={buttonClasses({ variant: "secondary", size: "lg", className: "mt-10" })}>
              About Greenfield
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ── Admissions steps ── */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <Reveal className="overflow-hidden rounded-[2rem] bg-brand-green-900 text-white">
          <div className="grid gap-12 p-8 sm:p-12 lg:grid-cols-5 lg:p-16">
            <div className="lg:col-span-2">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-300">Admissions</div>
              <h2 className="mt-3 font-display text-4xl font-semibold sm:text-5xl">Admissions made simple.</h2>
              <p className="mt-5 text-brand-green-100">
                Explore how Greenfield can support your child&apos;s growth. We&apos;ll guide you to the right entry
                point for creche, primary or secondary.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/apply" className={buttonClasses({ variant: "gold", size: "lg" })}>
                  Start an application
                </Link>
                <Link href="/admissions" className={buttonClasses({ variant: "inverse", size: "lg" })}>
                  How it works
                </Link>
              </div>
            </div>
            <ol className="relative grid gap-4 lg:col-span-3">
              {steps.map((s, i) => (
                <li
                  key={s.title}
                  className="flex gap-5 rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-sm"
                >
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-gold text-brand-green-950">
                    <s.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-brand-gold-300">Step {i + 1}</div>
                    <div className="mt-1 text-lg font-semibold">{s.title}</div>
                    <p className="mt-1 text-sm text-brand-green-100">{s.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </Reveal>
      </section>

      {/* ── Life at Greenfield ── */}
      <section className="mx-auto max-w-7xl px-6 pb-24">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">Life at Greenfield</div>
            <h2 className="mt-3 font-display text-4xl font-semibold text-slate-900 sm:text-5xl">Culture, creativity and community.</h2>
          </div>
          <Link href="/gallery" className="group inline-flex items-center gap-2 text-sm font-semibold text-brand-green">
            View the gallery
            <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>
        </div>
        <div className="mt-10 grid auto-rows-[180px] grid-cols-2 gap-4 sm:auto-rows-[220px] lg:grid-cols-4">
          {heroImages.map((img, i) => (
            <div
              key={img.src}
              className={
                "group relative overflow-hidden rounded-3xl " +
                (i === 0 ? "col-span-2 row-span-2" : i === 3 ? "col-span-2" : "")
              }
            >
              <Image
                src={img.src}
                alt={img.alt}
                fill
                sizes="(min-width: 1024px) 50vw, 100vw"
                className="object-cover transition duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
              <span className="absolute bottom-4 left-4 right-4 translate-y-2 text-sm font-medium text-white opacity-0 transition group-hover:translate-y-0 group-hover:opacity-100">
                {img.alt}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Contact ── */}
      <section id="enquire" className="bg-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-6 py-24 lg:grid-cols-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">Get in touch</div>
            <h2 className="mt-3 font-display text-4xl font-semibold text-slate-900 sm:text-5xl">We&apos;d love to hear from you.</h2>
            <p className="mt-5 max-w-lg text-lg text-slate-600">
              Tell us a little about your child and what you&apos;re looking for. Our admissions team will get back to you.
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
          </div>
          <div className="rounded-3xl border border-slate-200/80 bg-canvas p-6 sm:p-8">
            <h3 className="text-lg font-semibold text-slate-900">Send an enquiry</h3>
            <p className="mb-6 mt-1 text-sm text-slate-500">Our admissions team will contact you.</p>
            <InquiryForm />
          </div>
        </div>
      </section>
    </div>
  );
}
