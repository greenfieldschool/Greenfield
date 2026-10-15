"use client";

import Link from "next/link";
import { useEffect } from "react";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";

export default function PortalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Portal error:", error);
  }, [error]);

  return (
    <Card className="mx-auto max-w-lg">
      <div className="flex flex-col items-center px-6 py-10 text-center sm:px-10">
        <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600">
          <TriangleAlert className="h-7 w-7" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold text-slate-900">Something went wrong</h1>
        <p className="mt-2 text-sm text-slate-600">
          We couldn&apos;t load this page. Please try again in a moment.
        </p>
        {error.digest ? <p className="mt-2 text-xs text-slate-400">Error ID: {error.digest}</p> : null}
        <div className="mt-6 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <button onClick={reset} className={buttonClasses({ size: "lg" })}>
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            Try again
          </button>
          <Link href="/portal" className={buttonClasses({ variant: "secondary", size: "lg" })}>
            Back to portal
          </Link>
        </div>
      </div>
    </Card>
  );
}
