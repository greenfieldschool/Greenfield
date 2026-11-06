import { Crest } from "@/components/ui/logo";
import { IntroRelease } from "./intro-release";

// Runs while the page is still being read by the browser, before it paints: the first time someone lands on the home
// page in a browser session (it sits in the site layout, so it checks the address) (and motion isn't reduced) it turns the curtain on. Later visits go straight in.
const decide = `try{if(location.pathname==="/"&&!sessionStorage.getItem("gf-intro")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.classList.add("gf-intro-on");sessionStorage.setItem("gf-intro","1")}}catch(e){}`;

/**
 * First visit to the home page: the school crest assembles itself on deep green (edge, field, name, sun, oak, ribbon,
 * stars: .gf-crest-anim in globals.css) with the school line under it, then the curtain lifts to the hero (about 2.5
 * seconds, CSS only). Hidden from screen readers; it never blocks the page (it ends on its own even if scripts fail).
 */
export function IntroCurtain() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: decide }} />
      <div className="gf-intro pointer-events-none fixed inset-0 z-[80] flex-col items-center justify-center gap-6 bg-brand-green-950" aria-hidden="true">
        <Crest className="gf-crest-anim h-[13.5rem] w-48 drop-shadow-[0_18px_40px_rgba(0,0,0,0.35)] sm:h-[15.75rem] sm:w-56" title="" />
        <div className="gf-intro-word text-center">
          <div className="font-display text-2xl font-semibold text-white sm:text-3xl">Greenfield School</div>
          <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-brand-gold-300">Deep roots · Bright futures</div>
        </div>
      </div>
      <IntroRelease />
    </>
  );
}
