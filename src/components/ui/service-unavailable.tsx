import { CloudOff } from "lucide-react";
import { Logo } from "@/components/ui/logo";

// Full-page message for when the database can't be reached while loading a signed-in area.
export function ServiceUnavailable({
  area,
  timeout,
  detail
}: {
  area: string;
  timeout: boolean;
  detail?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12">
      <Logo />
      <div className="mt-8 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-card">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold-50 text-brand-gold-700">
          <CloudOff className="h-6 w-6" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">{area} is temporarily unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">
          {timeout
            ? "The connection to our database timed out. Please wait a moment and try again."
            : "Something went wrong while loading your account. Please try again."}
        </p>
        {/* A plain link reloads the page without needing client-side JavaScript. */}
        <a
          href=""
          className="mt-6 inline-flex h-10 items-center justify-center rounded-xl bg-brand-green px-5 text-sm font-semibold text-white hover:bg-brand-green-800"
        >
          Try again
        </a>
        {detail ? <p className="mt-5 break-words text-xs text-slate-400">{detail}</p> : null}
      </div>
    </div>
  );
}
