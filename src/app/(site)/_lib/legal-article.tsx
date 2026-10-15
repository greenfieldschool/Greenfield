import type { ReactNode } from "react";

// Long-form reading layout for legal pages: comfortable measure, heading scale and spacing for
// h2/h3/p/ul/ol/a children (no typography plugin needed).
export function LegalArticle({ children }: { children: ReactNode }) {
  return (
    <section className="bg-white">
      <article
        className={[
          "mx-auto max-w-3xl px-6 py-16 text-[1.0625rem] leading-8 text-slate-700 sm:py-20",
          "[&>*+*]:mt-6",
          "[&_h2]:mt-14 [&_h2]:font-display [&_h2]:text-3xl [&_h2]:font-semibold [&_h2]:leading-tight [&_h2]:text-slate-900",
          "[&_h3]:mt-10 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-slate-900",
          "[&_h2+*]:mt-4 [&_h3+*]:mt-3",
          "[&_ul]:list-disc [&_ol]:list-decimal [&_ul]:space-y-2 [&_ol]:space-y-2 [&_ul]:pl-6 [&_ol]:pl-6",
          "[&_a]:font-medium [&_a]:text-brand-green [&_a]:underline [&_a]:underline-offset-4",
          "[&_strong]:font-semibold [&_strong]:text-slate-900"
        ].join(" ")}
      >
        {children}
      </article>
    </section>
  );
}
