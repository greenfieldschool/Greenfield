import { cn } from "@/lib/cn";

const sizes = { sm: "h-8 w-8 text-xs", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-lg", xl: "h-20 w-20 text-2xl" };

export function Avatar({
  name,
  src,
  size = "md",
  className
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={cn("shrink-0 rounded-full object-cover ring-2 ring-white", sizes[size], className)} />;
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-brand-green-100 font-semibold text-brand-green-800",
        sizes[size],
        className
      )}
      aria-hidden="true"
    >
      {initials || "?"}
    </span>
  );
}
