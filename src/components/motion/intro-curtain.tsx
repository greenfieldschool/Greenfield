import { IntroRelease } from "./intro-release";

// Runs while the page is still being read by the browser, before it paints: the first time someone lands on the home
// page in a browser session (it sits in the site layout, so it checks the address) (and motion isn't reduced) it turns the curtain on. Later visits go straight in.
const decide = `try{if(location.pathname==="/"&&!sessionStorage.getItem("gf-intro")&&!matchMedia("(prefers-reduced-motion: reduce)").matches){document.documentElement.classList.add("gf-intro-on");sessionStorage.setItem("gf-intro","1")}}catch(e){}`;

/**
 * First visit to the home page: the crest draws itself in gold on deep green and the name rises, then the curtain
 * lifts to the hero (about 1.9 seconds, CSS only, see .gf-intro in globals.css). Hidden from screen readers; it never
 * blocks the page (it ends on its own even if scripts fail).
 */
export function IntroCurtain() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: decide }} />
      <div className="gf-intro pointer-events-none fixed inset-0 z-[80] flex-col items-center justify-center gap-5 bg-brand-green-950" aria-hidden="true">
        <svg viewBox="0 0 40 44" className="h-24 w-[5.5rem]">
          <path
            className="gf-intro-fill"
            d="M20 1.5 37 7.2v13.6c0 10.6-7.1 18.5-17 21.7C10.1 39.3 3 31.4 3 20.8V7.2L20 1.5Z"
            fill="#0B3D2E"
            stroke="none"
          />
          <path
            d="M20 1.5 37 7.2v13.6c0 10.6-7.1 18.5-17 21.7C10.1 39.3 3 31.4 3 20.8V7.2L20 1.5Z"
            pathLength={1}
            fill="none"
            stroke="#D4A017"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M20 33V17.5m0 0c0-4.6 3.4-8 8.4-8.2-.2 5-3.6 8.4-8.4 8.2Zm0 4.2c0-3.9-2.9-6.8-7.1-7 .2 4.2 3.1 7.1 7.1 7Z"
            pathLength={1}
            fill="none"
            stroke="#EDC54C"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="gf-intro-word text-center">
          <div className="font-display text-3xl font-semibold text-white">Greenfield</div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.4em] text-brand-gold-300">School</div>
        </div>
      </div>
      <IntroRelease />
    </>
  );
}
