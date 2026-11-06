import { MARK_TREE_Y, MARK_VIEWBOX, SHIELD, crestShapes } from "@/components/ui/logo";
import { cn } from "@/lib/cn";

/**
 * Loading screen with the school shield: a gold light runs round its edge while the sun's rays breathe, with a
 * thin gold bar under it. CSS only (.gf-crest-loader in globals.css), so it works before any script loads.
 * It fades in after a short pause, so quick page changes never flash it. Reduced motion: a still shield and the
 * word "Loading". Used by the public site's and staff dashboard's loading.tsx; the portal keeps its skeletons.
 */
export function CrestLoader({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn("gf-crest-loader flex flex-col items-center justify-center gap-4", className)}>
      <svg viewBox={MARK_VIEWBOX} className="h-20 w-[60px] drop-shadow-[0_10px_24px_rgba(11,61,46,0.18)]" aria-hidden="true">
        {crestShapes({ words: false, treeY: MARK_TREE_Y })}
        {/* The running light: a short gold dash travelling round the shield's edge. */}
        <path data-part="sweep" d={SHIELD} pathLength={1} fill="none" stroke="#EDC54C" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="gf-crest-loader-bar relative block h-[3px] w-24 overflow-hidden rounded-full bg-brand-green-900/10" aria-hidden="true">
        <span className="absolute inset-y-0 left-0 w-2/5 rounded-full bg-brand-gold-500" />
      </span>
      <span className="text-xs font-semibold uppercase tracking-[0.24em] text-brand-green-800/70">{label}…</span>
    </div>
  );
}
