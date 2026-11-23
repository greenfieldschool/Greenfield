import type { ReactNode } from "react";
import { Crest, LogoMark } from "@/components/ui/logo";
import { Lockup, OptionA, OptionAMark, OptionB, OptionBMark, OptionC } from "./options";
import { ConceptDShield, ConceptEShield, OptionARefined, Seal } from "./round2";

// Dev-only: three draft directions for a new crest, shown at the sizes the school will use them, for the school to
// choose from. Nothing here is live. See the brand-logo skill.

function Sizes({ children }: { children: (cls: string) => ReactNode }) {
  return (
    <div className="flex items-end gap-4">
      {["h-24 w-20", "h-12 w-10", "h-8 w-7", "h-4 w-4"].map((cls) => (
        <div key={cls}>{children(cls)}</div>
      ))}
    </div>
  );
}

function Option({
  name,
  idea,
  changes,
  big,
  mono,
  dark,
  small,
  lockup,
  seal
}: {
  name: string;
  idea: string;
  changes: string[];
  big: ReactNode;
  mono: ReactNode;
  dark: ReactNode;
  small: (cls: string) => ReactNode;
  lockup: ReactNode;
  seal?: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-display text-2xl font-semibold text-[#0B3D2E]">{name}</h2>
      <p className="mt-1 max-w-2xl text-slate-700">{idea}</p>
      <div className="mt-6 flex flex-wrap items-end gap-8">
        <div>{big}</div>
        {seal ? (
          <div>
            {seal}
            <div className="mt-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">Seal: certificates, report cards</div>
          </div>
        ) : null}
        <div>
          {mono}
          <div className="mt-2 text-center text-xs font-semibold uppercase tracking-wider text-slate-500">One colour</div>
        </div>
        <div className="rounded-xl bg-[#0B3D2E] p-4">{dark}</div>
        <div className="space-y-6">
          <div>
            <Sizes>{small}</Sizes>
            <div className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">Small: app icon to browser tab</div>
          </div>
          {lockup}
        </div>
      </div>
      <ul className="mt-6 list-disc space-y-1 pl-5 text-sm text-slate-700">
        {changes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </section>
  );
}

export default function LogoOptionsPreview() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 bg-slate-50 p-6 sm:p-8">
      <header>
        <h1 className="font-display text-3xl font-semibold text-[#0B3D2E]">Greenfield crest: options</h1>
        <p className="mt-2 max-w-2xl text-slate-700">
          Drafts for the school to compare. Round 2 is drawn from the school&apos;s own story (docs/crest-brief.md);
          round 1 came before it. All keep the school green and gold, embroider well and work in one colour.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-6 rounded-2xl border border-dashed border-slate-300 p-6">
        <Crest className="h-[180px] w-[160px]" />
        <div className="flex items-end gap-3">
          <LogoMark className="h-12 w-10" />
          <LogoMark className="h-8 w-7" />
          <LogoMark className="h-4 w-4" />
        </div>
        <div className="max-w-sm text-sm text-slate-600">
          <div className="font-semibold text-slate-800">Today&apos;s crest, for comparison</div>
          Three lines of words, two mottos, and a sun, hill, tree, ribbon and stars in one shield.
        </div>
      </section>

      <h2 className="pt-4 font-display text-2xl font-semibold text-slate-800">Round 3: Option A, refined</h2>

      <Option
        name="Option A, refined: the light oak"
        idea="A golden oak that gives off light, its trunk rising out of an open, ploughed field with its roots spread. Knowledge is Light; a lasting mark; and open ground where anyone, from any background, can grow."
        changes={[
          "Five strong rays of light instead of seven small ones, so it stays clear when stitched or printed small.",
          "The white hill with green furrows (it looked like a road) is now three gold rows of a ploughed field.",
          "The trunk rises out of the field and spreads into roots; the branches are bolder.",
          "A round seal for certificates and report cards. Motto: Knowledge is Light, on the ribbon and round the seal (chosen Nov 2026)."
        ]}
        big={<OptionARefined className="h-[300px] w-[246px]" />}
        seal={<Seal picture="A" uid="a2-seal" motto="KNOWLEDGE IS LIGHT" className="h-[240px] w-[240px]" />}
        mono={
          <div className="flex items-end gap-3">
            <OptionARefined tone="mono" className="h-[180px] w-[148px]" />
            <Seal picture="A" tone="mono" uid="a2-seal-mono" motto="KNOWLEDGE IS LIGHT" className="h-[140px] w-[140px]" />
          </div>
        }
        dark={<OptionARefined className="h-[180px] w-[148px]" />}
        small={(cls) => <OptionARefined small className={cls} />}
        lockup={<Lockup mark={<OptionARefined small className="h-16 w-[52px]" />} />}
      />

      <h2 className="pt-4 font-display text-2xl font-semibold text-slate-800">Round 2: from the school&apos;s story</h2>

      <Option
        name="Option D: the seedling and the star"
        idea="A seedling rising from an open field. Its two leaves, character and academics, grow from one stem and open upward, reaching for the star above: excel, and be the best anywhere."
        changes={[
          "Says the school's story in one picture: anyone can grow here (the open field), character and academics side by side (the leaves), growing upward (the seedling), excellence (the star).",
          "Goes with the motto Excellence in Character & Academics, which matches the story best.",
          "The same picture sits in a shield (blazers, signs, website) or a round seal (certificates, report cards, stamps)."
        ]}
        big={<ConceptDShield className="h-[280px] w-[225px]" />}
        seal={<Seal picture="D" uid="d-seal" className="h-[240px] w-[240px]" />}
        mono={
          <div className="flex items-end gap-3">
            <ConceptDShield tone="mono" className="h-[160px] w-[128px]" />
            <Seal picture="D" tone="mono" uid="d-seal-mono" className="h-[140px] w-[140px]" />
          </div>
        }
        dark={<ConceptDShield className="h-[160px] w-[128px]" />}
        small={(cls) => <ConceptDShield small className={cls} />}
        lockup={<Lockup motto="Excellence in Character & Academics" mark={<ConceptDShield small className="h-16 w-[52px]" />} />}
      />

      <Option
        name="Option E: roots and crown"
        idea="One oak, half above the ground and half below. Many roots from every side join into one trunk: people from any background, growing together. Below the ground is character, what holds a person up; above it, branches reach into the light."
        changes={[
          "Roots for character, crown for academics: both halves of one tree, as in the school's story.",
          "An oak, for the lasting mark the school means to leave. Goes with Knowledge is Light or the longer motto.",
          "Branch and root lines are 4 to 5 units thick, so they still stitch at 60mm; the small version drops the finer branches."
        ]}
        big={<ConceptEShield className="h-[280px] w-[225px]" />}
        seal={<Seal picture="E" uid="e-seal" motto="KNOWLEDGE IS LIGHT" className="h-[240px] w-[240px]" />}
        mono={
          <div className="flex items-end gap-3">
            <ConceptEShield tone="mono" className="h-[160px] w-[128px]" />
            <Seal picture="E" tone="mono" uid="e-seal-mono" motto="KNOWLEDGE IS LIGHT" className="h-[140px] w-[140px]" />
          </div>
        }
        dark={<ConceptEShield className="h-[160px] w-[128px]" />}
        small={(cls) => <ConceptEShield small className={cls} />}
        lockup={<Lockup mark={<ConceptEShield small className="h-16 w-[52px]" />} />}
      />

      <h2 className="pt-4 font-display text-2xl font-semibold text-slate-800">Round 1: before the brief</h2>

      <Option
        name="Option A: the light tree"
        idea="Closest to today's crest. The oak and the sun become one picture: a golden oak that gives off light, standing on a ploughed green field."
        changes={[
          "Keeps the shield, the oak, the sun and the ribbon, so families will recognise it.",
          "One motto, Knowledge is Light. Excellence in Character & Academics moves to letterheads and the website.",
          "The name comes out of the shield and sits beside or under it."
        ]}
        big={<OptionA className="h-[300px] w-[246px]" />}
        mono={<OptionA tone="mono" className="h-[180px] w-[148px]" />}
        dark={<OptionA className="h-[180px] w-[148px]" />}
        small={(cls) => <OptionAMark className={cls} />}
        lockup={<Lockup mark={<OptionAMark className="h-16 w-[52px]" />} />}
      />

      <Option
        name="Option B: the seal"
        idea="A round seal: an open book whose pages are a ploughed green field, with the sun of knowledge rising from it. The name and motto run round the ring."
        changes={[
          "Round, like an official stamp or a medal: suits certificates, report cards and blazer badges.",
          "The book says school straight away; the field says Greenfield; the sun says Knowledge is Light.",
          "The middle alone (without the ring words) becomes the app icon."
        ]}
        big={<OptionB className="h-[280px] w-[280px]" uid="b-big" />}
        mono={<OptionB tone="mono" className="h-[170px] w-[170px]" uid="b-mono" />}
        dark={<OptionB className="h-[170px] w-[170px]" uid="b-dark" />}
        small={(cls) => <OptionBMark className={cls} />}
        lockup={<Lockup mark={<OptionBMark className="h-16 w-16" />} />}
      />

      <Option
        name="Option C: the G of light"
        idea="A modern mark: a bold G for Greenfield on a plain shield, with a small sun shining in the opening of the G."
        changes={[
          "The simplest of the three: clearest on a phone screen, a gate sign or the side of the school bus.",
          "No words inside, so it never needs shrinking or squeezing; the name and motto are always written beside it.",
          "The biggest change from today's crest. Some families may miss the traditional look."
        ]}
        big={<OptionC className="h-[280px] w-[210px]" />}
        mono={<OptionC tone="mono" className="h-[170px] w-[128px]" />}
        dark={<OptionC className="h-[170px] w-[128px]" />}
        small={(cls) => <OptionC className={cls} />}
        lockup={<Lockup mark={<OptionC className="h-16 w-12" />} />}
      />
    </main>
  );
}
