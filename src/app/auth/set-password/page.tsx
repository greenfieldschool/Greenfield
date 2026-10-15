"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-6 py-16">
      <Link href="/" aria-label="Greenfield School home">
        <Logo />
      </Link>
      <div className="mt-8 w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-8 shadow-card">
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
          <KeyRound className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">Account</div>
        <h1 className="mt-2 font-display text-2xl font-semibold text-slate-900">Set your password</h1>
        <p className="mt-2 text-sm text-slate-600">Choose a password you will use to sign in next time.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label htmlFor="new-password" className="gf-label">
              New password
            </label>
            <div className="relative">
              <input
                id="new-password"
                className="gf-input pr-12"
                name="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                aria-describedby="new-password-hint"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3.5 text-slate-400 hover:text-slate-600"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
            <p id="new-password-hint" className="gf-hint">
              Minimum 8 characters.
            </p>
          </div>

          <div>
            <label htmlFor="confirm-password" className="gf-label">
              Confirm password
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                className="gf-input pr-12"
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
                className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3.5 text-slate-400 hover:text-slate-600"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Eye className="h-5 w-5" aria-hidden="true" />
                )}
              </button>
            </div>
          </div>

          {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

          <Button
            type="submit"
            size="lg"
            disabled={!canSubmit || state.status === "submitting"}
            className="w-full disabled:cursor-not-allowed"
          >
            {state.status === "submitting" ? "Saving…" : state.status === "success" ? "Saved" : "Save password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
