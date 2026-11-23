"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { POLICIES } from "@/lib/policies";
import { planError } from "@/lib/payment-plans";
import { toastUrl } from "../../_components/finance-server";

// Payment plan, default fee and discount actions for the invoice page. Every rule is checked again in the
// database function; these only read the form and report the result.

function str(fd: FormData, k: string) {
  return String(fd.get(k) ?? "").trim();
}

function done(back: string, msg: string, type: "success" | "error" = "success"): never {
  revalidatePath(back);
  revalidatePath("/admin/finance/payment-plans");
  revalidatePath("/admin/finance/invoices");
  revalidatePath("/admin/finance/debtors");
  redirect(toastUrl(back, msg, type));
}

function backFrom(fd: FormData) {
  const b = str(fd, "back");
  return b.startsWith("/admin/finance/") ? b : "/admin/finance/payment-plans";
}

export async function createPlanAction(fd: FormData) {
  const back = backFrom(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) done(back, "Database is not configured", "error");
  if (str(fd, "signed") !== "yes") done(back, "Tick the box to confirm the parent signed the School Fees Payment Agreement.", "error");
  const { error } = await supabase.rpc("create_payment_plan", {
    p_invoice: str(fd, "invoice_id"),
    p_instalments: Number(str(fd, "instalments")),
    p_agreed_name: str(fd, "agreed_name"),
    p_policy_version: POLICIES.families.version
  });
  if (error) done(back, planError(error.message), "error");
  done(back, "Payment plan saved. The parent has been told on the portal.");
}

export async function cancelPlanAction(fd: FormData) {
  const back = backFrom(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) done(back, "Database is not configured", "error");
  const { error } = await supabase.rpc("cancel_payment_plan", {
    p_plan: str(fd, "plan_id"),
    p_reason: str(fd, "reason"),
    p_note: str(fd, "note") || null
  });
  if (error) done(back, planError(error.message), "error");
  done(back, "Payment plan cancelled");
}

export async function chargeDefaultAction(fd: FormData) {
  const back = backFrom(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) done(back, "Database is not configured", "error");
  const ids = fd.getAll("instalment_id").map((v) => String(v)).filter(Boolean);
  if (!ids.length) done(back, "Choose at least one missed payment", "error");
  let charged = 0;
  const problems: string[] = [];
  for (const id of ids) {
    const { error } = await supabase.rpc("charge_plan_default", { p_instalment: id });
    if (error) problems.push(planError(error.message));
    else charged++;
  }
  if (!charged) done(back, problems[0] ?? "No default fee was added", "error");
  done(
    back,
    `Default fee added for ${charged} missed payment${charged === 1 ? "" : "s"}, and the parents told.` +
      (problems.length ? ` ${problems.length} skipped: ${problems[0]}` : ""),
    problems.length ? "error" : "success"
  );
}

export async function waiveDefaultAction(fd: FormData) {
  const back = backFrom(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) done(back, "Database is not configured", "error");
  const { error } = await supabase.rpc("waive_plan_default", {
    p_instalment: str(fd, "instalment_id"),
    p_reason: str(fd, "reason"),
    p_note: str(fd, "note") || null
  });
  if (error) done(back, planError(error.message), "error");
  done(back, "Default fee waived. The reason is in the invoice history.");
}

export async function removeDefaultAction(fd: FormData) {
  const back = backFrom(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) done(back, "Database is not configured", "error");
  const { error } = await supabase.rpc("remove_plan_default", {
    p_charge: str(fd, "charge_id"),
    p_reason: str(fd, "reason"),
    p_note: str(fd, "note") || null
  });
  if (error) done(back, planError(error.message), "error");
  done(back, "Default fee removed from the invoice");
}

export async function applyDiscountAction(fd: FormData) {
  const back = backFrom(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) done(back, "Database is not configured", "error");
  const { error } = await supabase.rpc("apply_early_discount", {
    p_invoice: str(fd, "invoice_id"),
    p_option: str(fd, "option"),
    p_note: str(fd, "note") || null
  });
  if (error) done(back, planError(error.message), "error");
  done(back, "Early payment discount added to the invoice");
}

export async function removeDiscountAction(fd: FormData) {
  const back = backFrom(fd);
  const supabase = getSupabaseServerClient();
  if (!supabase) done(back, "Database is not configured", "error");
  const { error } = await supabase.rpc("remove_early_discount", { p_discount: str(fd, "discount_id"), p_reason: str(fd, "reason") });
  if (error) done(back, planError(error.message), "error");
  done(back, "Discount removed from the invoice");
}
