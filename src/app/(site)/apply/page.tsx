import { Clock, FileText, Link2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { PublicPageHero } from "@/components/ui/public-page";
import { ApplyWizard } from "./ui";

type Props = {
  searchParams?: Record<string, string | string[] | undefined>;
};

const facts = [
  { icon: Clock, label: "Time", lines: ["1 min to start", "5–10 min to finish"] },
  { icon: FileText, label: "What you’ll need", lines: ["Parent phone number", "Child details + class seeking"] },
  { icon: Link2, label: "Save & resume", lines: ["Copy your resume link", "Continue later anytime"] }
];

export default function ApplyPage({ searchParams }: Props) {
  const t = typeof searchParams?.t === "string" ? searchParams.t : "";

  return (
    <div>
      <PublicPageHero
        eyebrow="Creche · Primary · Secondary"
        title="Admissions application"
        description="Start with quick details (under a minute) so we can contact you. You can complete the full application now or resume later."
      >
        <a href="#application" className={buttonClasses({ variant: "gold", size: "lg", className: "w-full sm:w-auto" })}>
          Start application
        </a>
        <a href="/contact" className={buttonClasses({ variant: "inverse", size: "lg", className: "w-full sm:w-auto" })}>
          Prefer to talk first? Contact us
        </a>
      </PublicPageHero>

      <section className="relative z-10 mx-auto -mt-10 max-w-5xl px-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.label} className="flex items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-lift">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
                <f.icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="text-xs font-medium text-slate-500">{f.label}</div>
                <div className="mt-1 text-sm font-semibold text-slate-900">{f.lines[0]}</div>
                <div className="text-sm text-slate-600">{f.lines[1]}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div id="application" className="mx-auto max-w-5xl scroll-mt-20 px-6 py-14 sm:py-20">
        <ApplyWizard initialToken={t} />
      </div>
    </div>
  );
}
