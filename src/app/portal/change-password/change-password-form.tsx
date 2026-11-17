"use client";

import { useMemo, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import PasswordInput from "@/components/password-input";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { playSound } from "@/lib/sound";

type State = { status: "idle" } | { status: "saving" } | { status: "error"; message: string };

export function ChangePasswordForm() {
  const [pw, setPw] = useState("");
  const [again, setAgain] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  const checks = useMemo(
    () => [
      { ok: pw.length >= 8, label: "At least 8 characters" },
      { ok: /[a-z]/i.test(pw) && /\d/.test(pw), label: "Letters and at least one number" },
      { ok: pw.length > 0 && pw === again, label: "Both boxes match" }
    ],
    [pw, again]
  );
  const ready = checks.every((c) => c.ok);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || state.status === "saving") return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState({ status: "error", message: "The portal isn't connected right now. Try again later." });
      return;
    }
    setState({ status: "saving" });
    const { error } = await supabase.auth.updateUser({ password: pw, data: { must_change_password: false } });
    if (error) {
      const same = /different from the old|same.*password/i.test(error.message);
      setState({ status: "error", message: same ? "That's the password you have now. Choose a new one." : error.message });
      playSound("error");
      return;
    }
    window.location.assign(`/portal?toast=${encodeURIComponent("Your new password is saved")}&toast_type=success`);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <PasswordInput
        id="new-password"
        label="New password"
        name="new_password"
        autoComplete="new-password"
        value={pw}
        onChange={(e) => setPw(e.target.value)}
        className="h-12 text-base"
        aria-describedby="pw-checks"
      />
      <PasswordInput
        id="new-password-again"
        label="Type it again"
        name="new_password_again"
        autoComplete="new-password"
        value={again}
        onChange={(e) => setAgain(e.target.value)}
        className="h-12 text-base"
      />
      <ul id="pw-checks" className="space-y-1 text-sm" aria-live="polite">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "flex items-center gap-2 text-brand-green-700" : "flex items-center gap-2 text-slate-500"}>
            <Check className={c.ok ? "h-4 w-4" : "h-4 w-4 opacity-30"} aria-hidden="true" />
            {c.label}
            <span className="sr-only">{c.ok ? "(done)" : "(not yet)"}</span>
          </li>
        ))}
      </ul>
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      <button type="submit" disabled={!ready || state.status === "saving"} className={buttonClasses({ size: "lg", className: "w-full text-base" })}>
        {state.status === "saving" ? (
          <>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
            Saving…
          </>
        ) : (
          "Save my password"
        )}
      </button>
    </form>
  );
}
