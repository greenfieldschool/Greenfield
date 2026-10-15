"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

import { Loader2, LogIn, ShieldCheck } from "lucide-react";
import PasswordInput from "@/components/password-input";
import { Logo } from "@/components/ui/logo";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { FieldBackdrop } from "@/components/three/field-backdrop";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

export function ConductorLoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter();

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

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-brand-green-950 px-4 py-12 sm:px-6">
      <FieldBackdrop />
      <div
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand-gold/15 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-green-500/20 blur-3xl"
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Logo inverted subtitle="Exam conductor" />
        </div>

        <div className="rounded-2xl border border-white/10 bg-white p-6 shadow-lift sm:p-8">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-600">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-brand-green-600">Conductor</div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Sign in</h1>
            </div>
          </div>
          <p className="mt-3 text-sm text-slate-600">Use your conductor email and password.</p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label htmlFor="conductor-email" className="gf-label">
                Email
              </label>
              <input
                id="conductor-email"
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
              id="conductor-password"
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
              disabled={!canSubmit || state.status === "submitting"}
              className={buttonClasses({ variant: "primary", size: "lg", className: "w-full" })}
            >
              {state.status === "submitting" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <LogIn className="h-4 w-4" aria-hidden="true" />
              )}
              {state.status === "submitting" ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-brand-green-200/80">Greenfield School · Exam supervision</p>
      </div>
    </div>
  );
}
