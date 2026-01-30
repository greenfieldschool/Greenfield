import Link from "next/link";
import { InquiryForm } from "@/components/inquiry-form";
import { HeroRotator } from "@/components/hero-rotator";
import { school } from "@/lib/school";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-sm text-slate-600">{label}</div>
    </div>
  );
}

export default function HomePage() {
  return (
    <div>
      <section className="relative overflow-hidden">
        <HeroRotator
          className="absolute inset-0"
          images={[
            {
              src: "https://sxujllqkkrwkqslmbgpc.supabase.co/storage/v1/object/public/media/20230524-FulaniCulture-2.jpg",
              alt: "Students celebrating culture at Greenfield School"
            },
            {
              src: "https://sxujllqkkrwkqslmbgpc.supabase.co/storage/v1/object/public/media/Entrace%20International%20Anti-Corruption%20Day%202017-2.JPG",
              alt: "School entrance during an event"
            },
            {
              src: "https://sxujllqkkrwkqslmbgpc.supabase.co/storage/v1/object/public/media/IMG_20211127_114635_936-2.jpg",
              alt: "Students and staff on campus"
            },
            {
              src: "https://sxujllqkkrwkqslmbgpc.supabase.co/storage/v1/object/public/media/Mr%20Teslim%20Explaining%20the%20wall%20Paintings1-2.JPG",
              alt: "Teacher explaining student artwork"
            }
          ]}
        />
        <div className="relative mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs text-white backdrop-blur">
                <span className="h-2 w-2 rounded-full bg-brand-green" />
                A modern learning community
              </div>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                Greenfield School
                <span className="block text-white/85">Where excellence grows.</span>
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-white/80">
                A clean, world-class academic experience with a focus on character, creativity, and
                real-world readiness.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-xl bg-brand-gold px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-brand-gold focus:ring-offset-2"
                >
                  Book a Visit
                </Link>
                <Link
                  href="/admissions"
                  className="inline-flex items-center justify-center rounded-xl border border-white/30 bg-white/10 px-5 py-3 text-sm font-semibold text-white backdrop-blur hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/60 focus:ring-offset-2 focus:ring-offset-black/0"
                >
                  Admissions
                </Link>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="rounded-2xl bg-brand-green p-6 text-white">
                <div className="text-sm/6 opacity-90">Featured</div>
                <div className="mt-2 text-2xl font-semibold">Discover our programs</div>
                <p className="mt-2 text-sm/6 opacity-90">
                  Strong academics, vibrant student life, and a supportive community.
                </p>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-white/10 p-4">
                    <div className="text-xs opacity-80">Focus</div>
                    <div className="mt-1 font-semibold">STEM + Arts</div>
                  </div>
                  <div className="rounded-xl bg-white/10 p-4">
                    <div className="text-xs opacity-80">Values</div>
                    <div className="mt-1 font-semibold">Character</div>
                  </div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <Stat label="Student-teacher ratio" value="12:1" />
                <Stat label="Clubs & societies" value="30+" />
                <Stat label="Sports & athletics" value="10+" />
                <Stat label="Learning support" value="Personalized" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Admissions made simple</h2>
            <p className="mt-3 text-slate-600">
              Request information, book a visit, and explore how Greenfield can support your child’s
              growth.
            </p>
            <div className="mt-5">
              <Link
                href="/admissions"
                className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              >
                View admissions
              </Link>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <ol className="space-y-4 text-sm text-slate-700">
              <li>
                <div className="font-semibold text-slate-900">1) Request information</div>
                <div className="mt-1 text-slate-600">We’ll share program details and answer questions.</div>
              </li>
              <li>
                <div className="font-semibold text-slate-900">2) Visit campus</div>
                <div className="mt-1 text-slate-600">Tour the facilities and meet our community.</div>
              </li>
              <li>
                <div className="font-semibold text-slate-900">3) Apply</div>
                <div className="mt-1 text-slate-600">A guided, supportive process from start to finish.</div>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="rounded-3xl border border-slate-200 bg-white p-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h2 className="text-2xl font-semibold text-slate-900">Contact Greenfield</h2>
              <p className="mt-3 text-slate-600">
                Tell us what you’re looking for and we’ll get back to you.
              </p>
              <div className="mt-6 space-y-2 text-sm text-slate-700">
                <div>
                  <span className="font-semibold text-slate-900">Email:</span> {school.email}
                </div>
                <div>
                  <span className="font-semibold text-slate-900">Phone:</span> {school.phone}
                </div>
              </div>
              <div className="mt-6">
                <Link href="/contact" className="text-sm font-semibold text-slate-900 hover:text-slate-700">
                  Prefer a full contact page? Go to Contact
                </Link>
              </div>
            </div>
            <InquiryForm />
          </div>
        </div>
      </section>
    </div>
  );
}
