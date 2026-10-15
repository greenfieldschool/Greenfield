"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import PasswordInput from "@/components/password-input";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { LoginFrame } from "../_components/portal-ui";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

export function PortalLoginForm({
  redirectTo,
  kind
}: {
  redirectTo: string;
  kind?: "student" | "guardian";
}) {
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
        message:
          sessionError?.message ??
          "Signed in, but no session was created. Check cookies and Supabase config."
      });
      return;
    }

    window.location.assign(redirectTo);
  }

  const isStudent = kind === "student";

  return (
    <LoginFrame footer="Having trouble signing in? Contact the school office.">
      <Link
        href="/portal/login"
        className="-ml-1 mb-4 inline-flex min-h-[40px] items-center gap-1 rounded-lg px-1 text-sm font-medium text-slate-500 hover:text-brand-green"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </Link>
      <h1 className="font-display text-3xl font-semibold text-slate-900">{isStudent ? "Student sign in" : "Parent sign in"}</h1>
      <p className="mt-1.5 text-sm text-slate-600">Use your email address and password.</p>

      <form className="mt-6 space-y-5" onSubmit={onSubmit}>
        <div>
          <label htmlFor="portal-email" className="gf-label">
            Email address
          </label>
          <input
            id="portal-email"
            className="gf-input h-12 text-base"
            name="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            required
            placeholder="you@greenfieldschool.ng"
          />
        </div>

        <PasswordInput
          id="portal-password"
          label="Password"
          name="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="h-12 text-base"
          required
        />

        {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}

        <button
          type="submit"
          disabled={!canSubmit || state.status === "submitting"}
          className={buttonClasses({ size: "lg", className: "w-full text-base" })}
        >
          {state.status === "submitting" ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </button>
      </form>
    </LoginFrame>
  );
}
