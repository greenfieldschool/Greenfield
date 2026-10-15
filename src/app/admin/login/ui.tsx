"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import { Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import PasswordInput from "@/components/password-input";
import { Logo } from "@/components/ui/logo";
import { FieldBackdrop } from "@/components/three/field-backdrop";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

export function AdminLoginForm({ redirectTo }: { redirectTo: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  const canSubmit = useMemo(() => {
    return email.trim().length >= 5 && password.length >= 8;
  }, [email, password]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!canSubmit || state.status === "submitting") return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState({ status: "error", message: "Supabase is not configured." });
      return;
    }

    setState({ status: "submitting" });

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setState({ status: "error", message: error.message });
      return;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !sessionData.session) {
      setState({
        status: "error",
        message: sessionError?.message ?? "Signed in, but no session was created. Check cookies and Supabase config."
      });
      return;
    }

    window.location.assign(redirectTo);
  }

  const submitting = state.status === "submitting";

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Brand panel (tablet/desktop only) */}
      <aside className="relative hidden w-[44%] max-w-2xl flex-col justify-between overflow-hidden bg-brand-green-950 p-10 text-white lg:flex xl:p-14">
        <FieldBackdrop />
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-brand-gold/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-green-500/20 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative">
          <Logo inverted subtitle="Staff dashboard" />
        </div>

        <div className="relative max-w-md">
          <h2 className="font-display text-4xl font-semibold leading-tight xl:text-5xl">Welcome back to Greenfield.</h2>
          <p className="mt-4 text-base leading-relaxed text-brand-green-100">
            Attendance, results, exams and fees — everything you need to run the school day, in one place.
          </p>
        </div>

        <div className="relative flex items-center gap-2 text-xs text-brand-green-200">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          Staff access only
        </div>
      </aside>

      {/* Sign-in form */}
      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex justify-center lg:hidden">
            <Logo subtitle="Staff dashboard" />
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-card sm:p-8">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
              <LockKeyhole className="h-5 w-5" aria-hidden="true" />
            </div>
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-slate-900">Sign in</h1>
            <p className="mt-1.5 text-sm text-slate-600">Use your staff email and password.</p>

            <form className="mt-6 space-y-4" onSubmit={onSubmit}>
              <div>
                <label htmlFor="admin-login-email" className="gf-label">
                  Email
                </label>
                <input
                  id="admin-login-email"
                  className="gf-input"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <PasswordInput
                id="admin-login-password"
                label="Password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />

              {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

              <button
                type="submit"
                disabled={!canSubmit || submitting}
                aria-busy={submitting}
                className={buttonClasses({ variant: "primary", size: "lg", className: "w-full" })}
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                {submitting ? "Signing in…" : "Sign in"}
              </button>
            </form>
          </div>

          <p className="mt-6 text-center text-xs text-slate-500">
            Trouble signing in? Ask the school administrator to reset your account.
          </p>
        </div>
      </main>
    </div>
  );
}
