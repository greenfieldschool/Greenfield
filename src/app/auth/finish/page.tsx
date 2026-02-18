"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function AuthFinishPage() {
  const router = useRouter();

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
        router.replace(next);
        router.refresh();
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Signing you in…</div>
        <div className="mt-2 text-sm text-slate-600">Please wait.</div>
      </div>
    </div>
  );
}
