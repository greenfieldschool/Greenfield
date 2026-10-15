"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function AuthFinishPage() {
  const router = useRouter();
  const didNavigateRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const supabase = getSupabaseBrowserClient();

      const url = new URL(window.location.href);
      const next = url.searchParams.get("next") ?? "/auth/set-password";
      const code = url.searchParams.get("code");

      const rawHash = window.location.hash?.length
        ? window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash
        : "";
      const hashParams = rawHash.length ? new URLSearchParams(rawHash) : null;
      const accessToken = hashParams?.get("access_token") ?? null;
      const refreshToken = hashParams?.get("refresh_token") ?? null;

      const hasAuthParams = !!code || (!!accessToken && !!refreshToken);

      if (!supabase) {
        router.replace(next);
        return;
      }

      try {
        if (hasAuthParams) {
          await supabase.auth.signOut();

          if (code) {
            await supabase.auth.exchangeCodeForSession(code);
          } else if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          }
        } else {
          await supabase.auth.getSession();
        }
      } catch {
        // ignore
      }

      if (!cancelled) {
        if (!didNavigateRef.current) {
          didNavigateRef.current = true;
          router.replace(next);
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-16">
      <Link href="/" aria-label="Greenfield School home">
        <Logo />
      </Link>
      <div className="mt-8 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 text-center shadow-card">
        <span className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-green-50 text-brand-green-600">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-semibold text-slate-900" aria-live="polite">
          Signing you in…
        </h1>
        <p className="mt-2 text-sm text-slate-600">Please wait.</p>
      </div>
    </div>
  );
}
