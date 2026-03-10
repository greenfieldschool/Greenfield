"use client";

import { useEffect } from "react";

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
    <div className="rounded-3xl border border-red-200 bg-red-50 p-8 shadow-sm">
      <div className="text-sm font-semibold text-red-900">Something went wrong</div>
      <p className="mt-2 text-sm text-red-800">
        An unexpected error occurred while loading this page.
      </p>
      {error.digest ? (
        <p className="mt-2 text-xs text-red-700 opacity-80">Error ID: {error.digest}</p>
      ) : null}
      <div className="mt-4 flex gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Try again
        </button>
        <a
          href="/portal"
          className="inline-flex items-center justify-center rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-900 hover:bg-red-50"
        >
          Back to portal
        </a>
      </div>
    </div>
  );
}
