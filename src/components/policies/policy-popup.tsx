"use client";

import Link from "next/link";
import { useRef, type ReactNode } from "react";
import { ScrollText, X } from "lucide-react";
import { cn } from "@/lib/cn";

// A small "School policy: …" link that opens the policy section in a pop-up, with a link to the whole policy.
// The section is rendered on the server and passed in as children; only that section reaches the browser.
export function PolicyPopup({
  title,
  href,
  draft,
  children,
  className
}: {
  title: string;
  href: string;
  draft: boolean;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = () => ref.current?.close();

  return (
    <>
      <button
        type="button"
        onClick={() => ref.current?.showModal()}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex min-h-[40px] items-center gap-1.5 rounded-lg text-left text-sm font-semibold text-brand-green-700 underline-offset-4 hover:underline print:hidden",
          className
        )}
      >
        <ScrollText className="h-4 w-4 shrink-0" aria-hidden="true" />
        School policy: {title}
      </button>
      <dialog
        ref={ref}
        aria-label={`School policy: ${title}`}
        // A click on the dark backdrop (outside the box) closes it.
        onClick={(e) => {
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-2xl rounded-2xl bg-white p-0 shadow-xl backdrop:bg-slate-900/50 print:hidden"
      >
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-green-600">School policy</div>
              <h2 className="mt-0.5 text-base font-semibold text-slate-900">{title}</h2>
              {draft ? <p className="mt-1 text-xs font-medium text-brand-gold-800">Draft, waiting for approval</p> : null}
            </div>
            <button
              type="button"
              onClick={close}
              className="-mr-2 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
            >
              <X className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">Close</span>
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4 sm:px-6">{children}</div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3 sm:px-6">
            <Link href={href} className="gf-link text-sm">
              Read the whole policy
            </Link>
            <button type="button" onClick={close} className="text-sm font-medium text-slate-600 hover:text-slate-900">
              Close
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
