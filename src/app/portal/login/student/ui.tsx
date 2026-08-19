"use client";

import { useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import PasswordInput from "@/components/password-input";

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
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Brand header */}
      <div className="bg-brand-green px-6 pb-10 pt-16 text-white sm:px-8 sm:pt-20">
        <div className="mx-auto max-w-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 shadow-md">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
              />
            </svg>
          </div>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Greenfield School</h1>
          <p className="mt-1 text-sm font-medium text-emerald-100">Student Portal</p>
        </div>
      </div>

      {/* Floating card overlapping the header */}
      <div className="relative mx-auto w-full max-w-sm -translate-y-6 px-4 pb-10">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <div className="mb-6">
            <div className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Student
            </div>
            <div className="mt-1 text-xl font-bold text-slate-900">Sign in</div>
            <p className="mt-1 text-sm text-slate-500">Use your admission number and password.</p>
          </div>

          <form className="space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm font-semibold text-slate-800">
                Admission number
              </label>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base uppercase tracking-wide outline-none transition focus:border-brand-green focus:ring-2 focus:ring-brand-green/20"
                name="admission_number"
                value={admissionNumber}
                onChange={(e) => setAdmissionNumber(e.target.value)}
                autoComplete="username"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="GRE/2025/001"
                required
              />
            </div>

            <PasswordInput
              label="Password"
              name="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />

            {state.status === "error" ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                {state.message}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={!canSubmit || state.status === "submitting"}
              className="mt-1 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-green px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-brand-green focus:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {state.status === "submitting" ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Signing in…
                </>
              ) : (
                "Sign in"
              )}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-slate-400">
          © Greenfield School · Student Portal
        </p>
      </div>
    </div>
  );
}
