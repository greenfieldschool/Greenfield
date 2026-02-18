"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  | { status: "success" };

export default function SetPasswordPage() {
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [state, setState] = useState<FormState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function ensureSessionFromUrl() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data } = await supabase.auth.getSession();
      if (data.session) return;

      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      try {
        if (code) {
          await supabase.auth.exchangeCodeForSession(code);
        } else if (window.location.hash?.length) {
          const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
          const params = new URLSearchParams(hash);
          const accessToken = params.get("access_token");
          const refreshToken = params.get("refresh_token");

          if (accessToken && refreshToken) {
            await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          }
        }
      } catch {
        // ignore and let the UI show an error when submitting
      }

      if (!cancelled) {
        router.refresh();
      }
    }

    ensureSessionFromUrl();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const canSubmit = useMemo(() => {
    return password.length >= 8 && password === confirmPassword;
  }, [password, confirmPassword]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!canSubmit || state.status === "submitting") return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState({ status: "error", message: "Supabase is not configured." });
      return;
    }

    setState({ status: "submitting" });

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setState({ status: "error", message: error.message });
      return;
    }

    setState({ status: "success" });
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Account</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Set your password</h1>
        <p className="mt-2 text-sm text-slate-600">Choose a password you will use to sign in next time.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-semibold text-slate-900">New password</label>
            <div className="mt-1 flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-brand-green">
              <input
                className="w-full bg-white px-4 py-3 text-sm outline-none"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Minimum 8 characters.</div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Confirm password</label>
            <div className="mt-1 flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-brand-green">
              <input
                className="w-full bg-white px-4 py-3 text-sm outline-none"
                name="confirm_password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {state.status === "error" ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {state.message}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!canSubmit || state.status === "submitting"}
            className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {state.status === "submitting" ? "Saving…" : state.status === "success" ? "Saved" : "Save password"}
          </button>
        </form>
      </div>
    </div>
  );
}
