"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

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

  return (
    <div className="mx-auto max-w-md px-6 py-16">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">{roleLabel}</div>
        <h1 className="mt-2 text-2xl font-semibold text-slate-900">Change password</h1>
        <p className="mt-2 text-sm text-slate-600">Update the password for your staff account.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-semibold text-slate-900">Email</label>
            <input
              className="mt-1 w-full rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm outline-none"
              value={email}
              readOnly
              type="email"
            />
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Current password</label>
            <div className="mt-1 flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-brand-green">
              <input
                className="w-full bg-white px-4 py-3 text-sm outline-none"
                name="current_password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((v) => !v)}
                className="px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showCurrentPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">New password</label>
            <div className="mt-1 flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:ring-2 focus-within:ring-brand-green">
              <input
                className="w-full bg-white px-4 py-3 text-sm outline-none"
                name="new_password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((v) => !v)}
                className="px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                {showNewPassword ? "Hide" : "Show"}
              </button>
            </div>
            <div className="mt-1 text-xs font-semibold text-slate-500">Minimum 8 characters.</div>
          </div>

          <div>
            <label className="text-sm font-semibold text-slate-900">Confirm new password</label>
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
            {state.status === "submitting" ? "Saving…" : state.status === "success" ? "Saved" : "Change password"}
          </button>
        </form>
      </div>
    </div>
  );
}
