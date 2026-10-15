import { cn } from "@/lib/cn";

// Greenfield crest mark: a shield with a growing leaf, in brand green and gold.
export function LogoMark({ className, inverted }: { className?: string; inverted?: boolean }) {
  return (
    <svg viewBox="0 0 40 44" className={cn("h-10 w-9", className)} aria-hidden="true">
      <path
        d="M20 1.5 37 7.2v13.6c0 10.6-7.1 18.5-17 21.7C10.1 39.3 3 31.4 3 20.8V7.2L20 1.5Z"
        fill={inverted ? "#ffffff" : "#0B3D2E"}
      />
      <path
        d="M20 1.5 37 7.2v13.6c0 10.6-7.1 18.5-17 21.7"
        fill="none"
        stroke="#D4A017"
        strokeWidth="2"
        strokeLinejoin="round"
        opacity={inverted ? 0 : 1}
      />
      <path
        d="M20 33V17.5m0 0c0-4.6 3.4-8 8.4-8.2-.2 5-3.6 8.4-8.4 8.2Zm0 4.2c0-3.9-2.9-6.8-7.1-7 .2 4.2 3.1 7.1 7.1 7Z"
        fill="none"
        stroke={inverted ? "#0B3D2E" : "#D4A017"}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({
  className,
  inverted,
  subtitle = "School"
}: {
  className?: string;
  inverted?: boolean;
  subtitle?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark inverted={inverted} className="h-9 w-8 shrink-0" />
      <span className="leading-none">
        <span className={cn("block font-display text-[1.15rem] font-semibold", inverted ? "text-white" : "text-brand-green")}>
          Greenfield
        </span>
        <span
          className={cn(
            "mt-0.5 block text-[0.62rem] font-semibold uppercase tracking-[0.22em]",
            inverted ? "text-brand-gold-300" : "text-brand-gold-700"
          )}
        >
          {subtitle}
        </span>
      </span>
    </span>
  );
}
