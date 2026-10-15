"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import PasswordInput from "@/components/password-input";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { LoginFrame } from "../../_components/portal-ui";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string };

function admissionNumberToEmail(admissionNumberRaw: string) {
  const admissionNumber = admissionNumberRaw.trim().toLowerCase();
  const domain = (process.env.NEXT_PUBLIC_STUDENT_LOGIN_EMAIL_DOMAIN ?? "students.greenfield.local")
    .trim()
    .toLowerCase();
  const normalizedUser = admissionNumber.replace(/[^a-z0-9._-]/g, "");
  return `${normalizedUser}@${domain}`;
}

export function StudentLoginForm({ redirectTo }: { redirectTo: string }) {
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  const canSubmit = useMemo(() => {
    return admissionNumber.trim().length >= 2 && password.length >= 8;
  }, [admissionNumber, password]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit || state.status === "submitting") return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState({ status: "error", message: "Supabase is not configured." });
      return;
    }

    setState({ status: "submitting" });

    const email = admissionNumberToEmail(admissionNumber);
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

  return (
    <LoginFrame footer="Forgot your password? Ask your class teacher or the school office.">
      <Link
        href="/portal/login"
        className="-ml-1 mb-4 inline-flex min-h-[40px] items-center gap-1 rounded-lg px-1 text-sm font-medium text-slate-500 hover:text-brand-green"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </Link>
      <h1 className="font-display text-3xl font-semibold text-slate-900">Student sign in</h1>
      <p className="mt-1.5 text-sm text-slate-600">Use your admission number and password.</p>

      <form className="mt-6 space-y-5" onSubmit={onSubmit}>
        <div>
          <label htmlFor="portal-admission-number" className="gf-label">
            Admission number
          </label>
          <input
            id="portal-admission-number"
            className="gf-input h-12 text-base uppercase tracking-wide"
            name="admission_number"
            value={admissionNumber}
            onChange={(e) => setAdmissionNumber(e.target.value)}
            autoComplete="username"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="GRE/2025/001"
            required
          />
          <p className="gf-hint">It&apos;s printed on your school ID card and report card.</p>
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
