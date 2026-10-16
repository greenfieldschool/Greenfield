import { cn } from "@/lib/cn";

// Picture attached to an exam question. Opens full size in a new tab so small details stay readable.
export function QuestionImage({ src, className }: { src: string | null | undefined; className?: string }) {
  if (!src) return null;
  return (
    <a href={src} target="_blank" rel="noreferrer" className={cn("mt-3 block w-fit max-w-full", className)} title="Open picture full size">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Picture for this question"
        loading="lazy"
        className="max-h-96 max-w-full rounded-xl border border-slate-200 bg-white object-contain"
      />
    </a>
  );
}
