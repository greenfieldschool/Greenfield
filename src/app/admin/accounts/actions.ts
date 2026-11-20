"use server";

// Server actions for Admin → Accounts. Creating sign-ins and setting passwords need the service key. Every action
// checks the person is an admin first, and writes the account log through log_account_action, which records who did
// it from the signed-in session.
// Temporary passwords (the school's decision, Nov 2026): a locked copy is kept until the end of the term so admins
// can look it up again (temporary_passwords, 20261119c). It is deleted when the person chooses their own password;
// passwords people choose themselves are never kept or shown.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { admissionNumberToEmail, generateTemporaryPassword } from "@/lib/admission-login";
import { lockTemporaryPassword, unlockTemporaryPassword } from "@/lib/temp-password-crypto";

/** At most this many accounts per click, so one request finishes well inside the server time limit. */
const BATCH = 40;

export type AccountKind = "pupil" | "parent";

export type AccountResultRow = {
  id: string;
  name: string;
  /** What the person types to sign in: the admission number for pupils, the email for parents. */
  username: string | null;
  className: string | null;
  /** The temporary password, shown to the admin. A locked copy is kept until `until`. */
  password: string | null;
  /** When the temporary password runs out (end of term), ISO date. */
  until: string | null;
  status: "created" | "reset" | "shown" | "skipped" | "failed";
  note: string | null;
};

export type AccountActionResult = {
  ok: boolean;
  message: string;
  rows: AccountResultRow[];
  remaining: number;
};

async function requireAdmin() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return { error: "The database is not connected, so nothing was changed." } as const;
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again." } as const;
  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin"].includes(String(me?.role ?? ""))) return { error: "Only admins can manage accounts." } as const;
  const service = getSupabaseServiceClient();
  if (!service) return { error: "The server is missing its Supabase service key, so accounts can't be changed. Ask the developer to set SUPABASE_SERVICE_ROLE_KEY." } as const;
  return { supabase, service, userId: user.id } as const;
}

function friendlyAuthError(message: string | undefined) {
  const m = (message ?? "").toLowerCase();
  if (m.includes("already") && (m.includes("registered") || m.includes("exists"))) {
    return "A sign-in with this name already exists but isn't linked to anyone. Link it on the \"No owner\" tab.";
  }
  if (m.includes("password")) return "The password was not accepted. Try again.";
  return message || "Something went wrong. Try again.";
}

type Db = NonNullable<ReturnType<typeof getSupabaseServerClient>>;

/** When a temporary password given now runs out (end of the current term). */
async function termEnd(supabase: Db): Promise<string> {
  const { data } = await supabase.rpc("temporary_password_expiry");
  return typeof data === "string" ? data : new Date(Date.now() + 120 * 86_400_000).toISOString();
}

/** Keeps the locked copy so admins can look it up again until the end of term. Never throws. */
async function keepCopy(supabase: Db, userId: string, password: string): Promise<string | null> {
  const locked = lockTemporaryPassword(password);
  if (!locked) return null;
  const { data, error } = await supabase.rpc("save_temporary_password", { p_user: userId, p_ciphertext: locked });
  return error ? null : (data as string | null);
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s))));
}

function summary(rows: AccountResultRow[], remaining: number, verb: "created" | "reset") {
  const done = rows.filter((r) => r.status === verb).length;
  const skipped = rows.filter((r) => r.status === "skipped").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const parts = [`${done} ${verb === "created" ? "account" : "password"}${done === 1 ? "" : "s"} ${verb === "created" ? "created" : "reset"}`];
  if (skipped) parts.push(`${skipped} skipped`);
  if (failed) parts.push(`${failed} didn't work`);
  if (remaining) parts.push(`${remaining} more selected: press again to continue`);
  return parts.join(" · ");
}

/** Creates portal accounts for pupils or parents who don't have one, each with a temporary password. */
export async function createAccountsAction(kind: AccountKind, idsIn: string[]): Promise<AccountActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, message: ctx.error ?? "Not allowed.", rows: [], remaining: 0 };
  const { supabase, service } = ctx;
  const all = uniqueIds(idsIn);
  const ids = all.slice(0, BATCH);
  const rows: AccountResultRow[] = [];
  const until = await termEnd(supabase);

  if (kind === "pupil") {
    const [{ data: students }, { data: links }] = await Promise.all([
      supabase.from("students").select("id, first_name, last_name, admission_number, status, classes(name)").in("id", ids),
      supabase.from("student_user_links").select("student_id").in("student_id", ids)
    ]);
    const linked = new Set((links ?? []).map((l: { student_id: string }) => l.student_id));
    for (const s of (students ?? []) as unknown as Array<{
      id: string;
      first_name: string;
      last_name: string;
      admission_number: string | null;
      status: string;
      classes: { name: string } | Array<{ name: string }> | null;
    }>) {
      const name = `${s.first_name} ${s.last_name}`.trim();
      const cls = Array.isArray(s.classes) ? s.classes[0]?.name ?? null : s.classes?.name ?? null;
      const base = { id: s.id, name, username: s.admission_number, className: cls, password: null, until: null };
      if (linked.has(s.id)) {
        rows.push({ ...base, status: "skipped", note: "Already has an account" });
        continue;
      }
      if (!s.admission_number) {
        rows.push({ ...base, status: "skipped", note: "No admission number yet" });
        continue;
      }
      if (s.status === "inactive") {
        rows.push({ ...base, status: "skipped", note: "Record is deactivated" });
        continue;
      }
      const password = generateTemporaryPassword();
      const email = admissionNumberToEmail(s.admission_number);
      const { data: created, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: name, must_change_password: true, temp_password_expires_at: until }
      });
      if (error || !created.user) {
        rows.push({ ...base, status: "failed", note: friendlyAuthError(error?.message) });
        continue;
      }
      await service.from("profiles").upsert({ id: created.user.id, role: "student", email, full_name: name }, { onConflict: "id" });
      const { error: linkError } = await service.from("student_user_links").upsert({ user_id: created.user.id, student_id: s.id }, { onConflict: "user_id" });
      if (linkError) {
        rows.push({ ...base, status: "failed", note: "The sign-in was made but couldn't be linked. Link it on the \"No owner\" tab." });
        continue;
      }
      await supabase.rpc("log_account_action", { p_action: "account_created", p_student: s.id, p_user: created.user.id, p_detail: "Temporary password given" });
      const kept = await keepCopy(supabase, created.user.id, password);
      rows.push({ ...base, password, until: kept ?? until, status: "created", note: kept ? null : "The school's copy couldn't be kept: print the slip now" });
    }
  } else {
    const [{ data: guardians }, { data: links }] = await Promise.all([
      supabase.from("guardians").select("id, full_name, email").in("id", ids),
      supabase.from("guardian_user_links").select("guardian_id").in("guardian_id", ids)
    ]);
    const linked = new Set((links ?? []).map((l: { guardian_id: string }) => l.guardian_id));
    for (const g of (guardians ?? []) as Array<{ id: string; full_name: string; email: string | null }>) {
      const email = (g.email ?? "").trim().toLowerCase();
      const base = { id: g.id, name: g.full_name, username: email || null, className: null, password: null, until: null };
      if (linked.has(g.id)) {
        rows.push({ ...base, status: "skipped", note: "Already has an account" });
        continue;
      }
      if (!email || !email.includes("@")) {
        rows.push({ ...base, status: "skipped", note: "No email address on the parent's record" });
        continue;
      }
      const password = generateTemporaryPassword();
      const { data: created, error } = await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: g.full_name, must_change_password: true, temp_password_expires_at: until }
      });
      if (error || !created.user) {
        rows.push({ ...base, status: "failed", note: friendlyAuthError(error?.message) });
        continue;
      }
      await service.from("profiles").upsert({ id: created.user.id, role: "parent", email, full_name: g.full_name }, { onConflict: "id" });
      const { error: linkError } = await service.from("guardian_user_links").upsert({ user_id: created.user.id, guardian_id: g.id }, { onConflict: "user_id" });
      if (linkError) {
        rows.push({ ...base, status: "failed", note: "The sign-in was made but couldn't be linked. Link it on the \"No owner\" tab." });
        continue;
      }
      await supabase.rpc("log_account_action", { p_action: "account_created", p_guardian: g.id, p_user: created.user.id, p_detail: "Temporary password given" });
      const kept = await keepCopy(supabase, created.user.id, password);
      rows.push({ ...base, password, until: kept ?? until, status: "created", note: kept ? null : "The school's copy couldn't be kept: print the slip now" });
    }
  }

  revalidatePath("/admin/accounts");
  const remaining = all.length - ids.length;
  return { ok: true, message: summary(rows, remaining, "created"), rows, remaining };
}

/** Gives each selected person a new temporary password (shown once). */
export async function resetPasswordsAction(kind: AccountKind, idsIn: string[]): Promise<AccountActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, message: ctx.error ?? "Not allowed.", rows: [], remaining: 0 };
  const { supabase, service } = ctx;
  const all = uniqueIds(idsIn);
  const ids = all.slice(0, BATCH);
  const rows: AccountResultRow[] = [];
  const until = await termEnd(supabase);

  // Read through the admin overview so we know each person's sign-in.
  const rpcName = kind === "pupil" ? "admin_pupil_accounts" : "admin_parent_accounts";
  const { data, error } = await supabase.rpc(rpcName);
  if (error) return { ok: false, message: "The database update for accounts hasn't been run yet.", rows: [], remaining: 0 };
  type Overview = {
    student_id?: string;
    guardian_id?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    admission_number?: string | null;
    email?: string | null;
    class_name?: string | null;
    user_id: string | null;
  };
  const byId = new Map(
    ((data ?? []) as Overview[]).map((r) => [String(kind === "pupil" ? r.student_id : r.guardian_id), r] as const)
  );

  for (const id of ids) {
    const r = byId.get(id);
    if (!r) continue;
    const name = kind === "pupil" ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() : r.full_name ?? "";
    const base = {
      id,
      name,
      username: kind === "pupil" ? r.admission_number ?? null : r.email ?? null,
      className: r.class_name ?? null,
      password: null,
      until: null
    };
    if (!r.user_id) {
      rows.push({ ...base, status: "skipped", note: "No account yet: create one instead" });
      continue;
    }
    const password = generateTemporaryPassword();
    const { error: updError } = await service.auth.admin.updateUserById(r.user_id, {
      password,
      email_confirm: true,
      user_metadata: { must_change_password: true, temp_password_expires_at: until }
    });
    if (updError) {
      rows.push({ ...base, status: "failed", note: friendlyAuthError(updError.message) });
      continue;
    }
    await supabase.rpc("log_account_action", {
      p_action: "password_reset",
      p_student: kind === "pupil" ? id : null,
      p_guardian: kind === "parent" ? id : null,
      p_user: r.user_id,
      p_detail: "Temporary password given"
    });
    const kept = await keepCopy(supabase, r.user_id, password);
    rows.push({ ...base, password, until: kept ?? until, status: "reset", note: kept ? null : "The school's copy couldn't be kept: print the slip now" });
  }

  revalidatePath("/admin/accounts");
  const remaining = all.length - ids.length;
  return { ok: true, message: summary(rows, remaining, "reset"), rows, remaining };
}

/**
 * Looks temporary passwords up again (for a family that lost theirs, or to reprint slips). Admins only; each look-up
 * is recorded in the account history with the admin's name and the reason.
 */
export async function showTemporaryPasswordsAction(kind: AccountKind, idsIn: string[], purpose = "Looked up"): Promise<AccountActionResult> {
  const ctx = await requireAdmin();
  if ("error" in ctx) return { ok: false, message: ctx.error ?? "Not allowed.", rows: [], remaining: 0 };
  const { supabase } = ctx;
  const ids = uniqueIds(idsIn).slice(0, 200);

  const { data, error } = await supabase.rpc(kind === "pupil" ? "admin_pupil_accounts" : "admin_parent_accounts");
  if (error) return { ok: false, message: "The database update for accounts hasn't been run yet.", rows: [], remaining: 0 };
  type Overview = {
    student_id?: string;
    guardian_id?: string;
    first_name?: string;
    last_name?: string;
    full_name?: string;
    admission_number?: string | null;
    login_email?: string | null;
    class_name?: string | null;
    user_id: string | null;
  };
  const people = ((data ?? []) as Overview[]).filter((r) => ids.includes(String(kind === "pupil" ? r.student_id : r.guardian_id)));
  const userIds = people.map((p) => p.user_id).filter((u): u is string => Boolean(u));
  const { data: copies, error: viewError } = userIds.length
    ? await supabase.rpc("view_temporary_passwords", { p_users: userIds, p_purpose: purpose.slice(0, 200) })
    : { data: [], error: null };
  if (viewError) return { ok: false, message: "Temporary passwords can't be looked up yet: the database update hasn't been run.", rows: [], remaining: 0 };
  const byUser = new Map(((copies ?? []) as Array<{ user_id: string; ciphertext: string; expires_at: string }>).map((c) => [c.user_id, c] as const));

  const rows: AccountResultRow[] = people.map((p) => {
    const base = {
      id: String(kind === "pupil" ? p.student_id : p.guardian_id),
      name: kind === "pupil" ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() : p.full_name ?? "",
      username: kind === "pupil" ? p.admission_number ?? null : p.login_email ?? null,
      className: p.class_name ?? null
    };
    if (!p.user_id) return { ...base, password: null, until: null, status: "skipped" as const, note: "No account yet" };
    const copy = byUser.get(p.user_id);
    if (!copy) {
      return { ...base, password: null, until: null, status: "skipped" as const, note: "No temporary password kept: they chose their own, or it ran out. Give a new one." };
    }
    const password = unlockTemporaryPassword(copy.ciphertext);
    if (!password) {
      return { ...base, password: null, until: null, status: "failed" as const, note: "The school's copy can't be read any more (the server key changed). Give a new one." };
    }
    return { ...base, password, until: copy.expires_at, status: "shown" as const, note: null };
  });
  const shown = rows.filter((r) => r.status === "shown").length;
  const missing = rows.length - shown;
  return {
    ok: true,
    message: `${shown} temporary password${shown === 1 ? "" : "s"} shown${missing ? ` · ${missing} not available` : ""}`,
    rows,
    remaining: 0
  };
}

function back(tab: string, message: string, type: "success" | "error" = "success"): never {
  redirect(`/admin/accounts?tab=${tab}&toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

/** Gives admission numbers to on-roll pupils who have none (the selected ones, or all). */
export async function assignNumbersAction(formData: FormData) {
  const ctx = await requireAdmin();
  if ("error" in ctx) back("pupils", ctx.error ?? "Not allowed.", "error");
  const ids = uniqueIds(formData.getAll("student_id").map(String));
  const { data, error } = await ctx.supabase.rpc("assign_missing_admission_numbers", { p_students: ids.length ? ids : null });
  if (error) back("pupils", `Numbers were not given: ${error.message}`, "error");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/students");
  const n = Number(data ?? 0);
  back("pupils", n ? `${n} admission number${n === 1 ? "" : "s"} given` : "Every pupil already has a number");
}

/**
 * Asks the developers to change the admission number format. Admins can't change it themselves (the school's rule):
 * a developer approves or rejects the request in the database (see the admission-and-accounts skill).
 */
export async function requestFormatChangeAction(formData: FormData) {
  const ctx = await requireAdmin();
  if ("error" in ctx) back("format", ctx.error ?? "Not allowed.", "error");
  const str = (k: string) => String(formData.get(k) ?? "").trim();
  const sectionPrefixes: Record<string, string> = {};
  for (const level of ["creche", "primary", "secondary"]) {
    const v = str(`prefix_${level}`).toUpperCase();
    if (v) sectionPrefixes[level] = v;
  }
  const digits = Math.min(8, Math.max(1, Number(str("digits")) || 3));
  const { error } = await ctx.supabase.rpc("request_admission_format_change", {
    p_template: str("template") || "{PREFIX}/{YYYY}/{N}",
    p_prefix: str("prefix"),
    p_section_prefixes: sectionPrefixes,
    p_digits: digits,
    p_year_basis: str("year_basis") === "calendar" ? "calendar" : "session",
    p_session_start_month: Number(str("session_start_month")) || 9,
    p_auto_assign: formData.get("auto_assign") === "on",
    p_reason: str("reason")
  });
  if (error) back("format", error.message, "error");
  revalidatePath("/admin/accounts");
  back("format", "Sent to the developers. Nothing changes until they approve it.");
}

/** Withdraws the admin's waiting format request. */
export async function cancelFormatRequestAction(formData: FormData) {
  const ctx = await requireAdmin();
  if ("error" in ctx) back("format", ctx.error ?? "Not allowed.", "error");
  const { error } = await ctx.supabase.rpc("cancel_admission_format_request", { p_request: String(formData.get("request_id") ?? "") });
  if (error) back("format", error.message, "error");
  revalidatePath("/admin/accounts");
  back("format", "Request withdrawn");
}

/** Links a sign-in that belongs to nobody to a pupil (by admission number) or a parent (by email on their record). */
export async function linkAccountAction(formData: FormData) {
  const ctx = await requireAdmin();
  if ("error" in ctx) back("unlinked", ctx.error ?? "Not allowed.", "error");
  const { supabase, service } = ctx;
  const userId = String(formData.get("user_id") ?? "").trim();
  const target = String(formData.get("target") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  if (!userId || !target) back("unlinked", "Type the pupil's admission number or the parent's email first.", "error");

  if (target.includes("@")) {
    const { data: g } = await supabase.from("guardians").select("id, full_name").ilike("email", target).limit(2);
    const list = (g ?? []) as Array<{ id: string; full_name: string }>;
    if (list.length !== 1) back("unlinked", list.length ? "More than one parent has that email. Link from the parent's page." : "No parent record has that email.", "error");
    const { error } = await service.from("guardian_user_links").upsert({ user_id: userId, guardian_id: list[0].id }, { onConflict: "user_id" });
    if (error) back("unlinked", `Couldn't link: ${error.message}`, "error");
    if (role !== "parent") await service.from("profiles").update({ role: "parent" }).eq("id", userId);
    await supabase.rpc("log_account_action", { p_action: "account_linked", p_guardian: list[0].id, p_user: userId, p_detail: "Linked from No owner" });
    revalidatePath("/admin/accounts");
    back("unlinked", `Linked to ${list[0].full_name}`);
  }

  const { data: owner } = await supabase.rpc("admission_number_owner", { p_number: target, p_exclude: null });
  const o = ((owner ?? []) as Array<{ student_id: string; full_name: string }>)[0];
  if (!o) back("unlinked", "No pupil has that admission number.", "error");
  const { error } = await service.from("student_user_links").upsert({ user_id: userId, student_id: o.student_id }, { onConflict: "user_id" });
  if (error) back("unlinked", `Couldn't link: ${error.message}`, "error");
  if (role !== "student") await service.from("profiles").update({ role: "student" }).eq("id", userId);
  await supabase.rpc("log_account_action", { p_action: "account_linked", p_student: o.student_id, p_user: userId, p_detail: "Linked from No owner" });
  revalidatePath("/admin/accounts");
  back("unlinked", `Linked to ${o.full_name}`);
}
