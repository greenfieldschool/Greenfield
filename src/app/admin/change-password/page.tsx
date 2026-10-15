"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection, Field } from "@/components/ui/form-section";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "error"; message: string }
  | { status: "success" };

export default function AdminChangePasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState<string>("");
  const [roleLabel, setRoleLabel] = useState<string>("Staff");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [state, setState] = useState<FormState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return;

      const { data, error } = await supabase.auth.getUser();

      if (cancelled) return;

      if (error || !data.user?.email) {
        router.replace("/admin/login?redirectTo=/admin/change-password");
        return;
      }

      setEmail(data.user.email);

      const { data: profileData } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();

      const role = (profileData as { role?: string | null } | null)?.role ?? null;
      const label =
        role === "super_admin" || role === "admin"
          ? "Admin"
          : role === "teacher"
            ? "Teacher"
            : role === "front_desk"
              ? "Front desk"
              : role === "nurse"
                ? "Nurse"
                : "Staff";
      setRoleLabel(label);
    }

    loadUser();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const canSubmit = useMemo(() => {
    return (
      email.trim().length > 0 &&
      currentPassword.length >= 8 &&
      newPassword.length >= 8 &&
      newPassword === confirmPassword
    );
  }, [email, currentPassword, newPassword, confirmPassword]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!canSubmit || state.status === "submitting") return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setState({ status: "error", message: "Supabase is not configured." });
      return;
    }

    setState({ status: "submitting" });

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword
    });

    if (signInError) {
      setState({ status: "error", message: "Current password is incorrect." });
      return;
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      setState({ status: "error", message: updateError.message });
      return;
    }

    setState({ status: "success" });
    router.push("/admin");
    router.refresh();
  }

  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={roleLabel} title="Change password" description="Update the password for your staff account." />

      <form onSubmit={onSubmit} className="max-w-2xl">
        <FormSection
          title="Password"
          description="Confirm your current password, then choose a new one."
          footer={
            <button
              type="submit"
              disabled={!canSubmit || state.status === "submitting"}
              aria-busy={state.status === "submitting"}
              className={buttonClasses({ variant: "primary" })}
            >
              {state.status === "submitting" ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <KeyRound className="h-4 w-4" aria-hidden="true" />
              )}
              {state.status === "submitting" ? "Saving…" : state.status === "success" ? "Saved" : "Change password"}
            </button>
          }
        >
          <div className="space-y-4">
            <Field label="Email" htmlFor="cp-email">
              <input id="cp-email" className="gf-input bg-slate-50 text-slate-600" value={email} readOnly type="email" />
            </Field>

            <PasswordField
              id="cp-current"
              label="Current password"
              name="current_password"
              value={currentPassword}
              onChange={setCurrentPassword}
              show={showCurrentPassword}
              onToggle={() => setShowCurrentPassword((v) => !v)}
              autoComplete="current-password"
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <PasswordField
                id="cp-new"
                label="New password"
                name="new_password"
                value={newPassword}
                onChange={setNewPassword}
                show={showNewPassword}
                onToggle={() => setShowNewPassword((v) => !v)}
                autoComplete="new-password"
                hint="Minimum 8 characters."
              />
              <PasswordField
                id="cp-confirm"
                label="Confirm new password"
                name="confirm_password"
                value={confirmPassword}
                onChange={setConfirmPassword}
                show={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((v) => !v)}
                autoComplete="new-password"
                hint={mismatch ? <span className="text-red-600">Passwords don&apos;t match yet.</span> : undefined}
              />
            </div>

            {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
          </div>
        </FormSection>
      </form>
    </div>
  );
}

function PasswordField({
  id,
  label,
  name,
  value,
  onChange,
  show,
  onToggle,
  autoComplete,
  hint
}: {
  id: string;
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  show: boolean;
  onToggle: () => void;
  autoComplete: string;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} htmlFor={id} hint={hint}>
      <div className="relative">
        <input
          id={id}
          className="gf-input pr-12"
          name={name}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute inset-y-0 right-0 flex items-center rounded-r-xl px-3.5 text-slate-400 hover:text-slate-600"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-5 w-5" aria-hidden="true" /> : <Eye className="h-5 w-5" aria-hidden="true" />}
        </button>
      </div>
    </Field>
  );
}
