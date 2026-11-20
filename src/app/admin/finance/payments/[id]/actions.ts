"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { friendlyPaymentError } from "@/lib/payment-corrections";

// Payment corrections (20261120_payment_corrections.sql). The database refuses to change the amount, date, pupil or
// method of a recorded payment, refuses deletes, and writes every step to finance_payment_log. These actions only
// pass the form through; everything they need comes in the form fields.

function back(paymentId: string, message: string, type: "success" | "error" = "error"): never {
  redirect(`/admin/finance/payments/${paymentId}?toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

function revalidateFinance(paymentId: string) {
  revalidatePath("/admin/finance/payments");
  revalidatePath(`/admin/finance/payments/${paymentId}`);
  revalidatePath("/admin/finance/invoices", "layout");
  revalidatePath("/admin/finance/debtors");
  revalidatePath("/admin/finance");
  revalidatePath("/admin/finance/payments/import");
  revalidatePath("/portal/billing");
}

export async function savePaymentDetailsAction(formData: FormData) {
  const id = String(formData.get("payment_id") ?? "").trim();
  if (!id) redirect("/admin/finance/payments");
  const reference = String(formData.get("reference") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Database is not configured — nothing was saved");

  const { error } = await supabase
    .from("finance_payment_transactions")
    .update({ reference: reference || null, notes: notes || null })
    .eq("id", id);
  if (error) back(id, friendlyPaymentError(error.message));
  revalidateFinance(id);
  back(id, "Reference and notes saved", "success");
}

export async function reversePaymentAction(formData: FormData) {
  const id = String(formData.get("payment_id") ?? "").trim();
  if (!id) redirect("/admin/finance/payments");
  const reason = String(formData.get("reason") ?? "").trim();
  const note = String(formData.get("reason_note") ?? "").trim();
  if (!reason) back(id, "Choose why the payment is being reversed");
  if (reason === "other" && note.length < 3) back(id, "Type the reason when you choose Other");
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Database is not configured — nothing was saved");

  const { data, error } = await supabase.rpc("reverse_payment", { p_payment: id, p_reason: reason, p_note: note || null });
  if (error) back(id, friendlyPaymentError(error.message));
  revalidateFinance(id);
  const reopened = Boolean((data as { bank_line_reopened?: boolean } | null)?.bank_line_reopened);
  back(
    id,
    reopened
      ? "Payment reversed. Its bank line is back in the bank inbox to match again."
      : "Payment reversed. If money was received, enter the correct payment now.",
    "success"
  );
}

export async function movePaymentAction(formData: FormData) {
  const id = String(formData.get("payment_id") ?? "").trim();
  if (!id) redirect("/admin/finance/payments");
  const invoice = String(formData.get("invoice_id") ?? "").trim();
  const reason = String(formData.get("move_reason") ?? "").trim();
  if (reason.length < 3) back(id, "Say why the payment is being moved");
  const supabase = getSupabaseServerClient();
  if (!supabase) back(id, "Database is not configured — nothing was saved");

  const { data, error } = await supabase.rpc("move_payment_invoice", {
    p_payment: id,
    p_invoice: invoice || null,
    p_reason: reason
  });
  if (error) back(id, friendlyPaymentError(error.message));
  revalidateFinance(id);
  const r = (data ?? {}) as { allocated?: number; on_account?: number };
  const extra = Number(r.on_account ?? 0);
  back(
    id,
    !invoice
      ? "Payment taken off its invoice and kept as paid in advance"
      : extra > 0
        ? `Payment moved. ₦${extra.toLocaleString("en-NG")} more than the invoice owed is kept as paid in advance.`
        : "Payment moved to the invoice",
    "success"
  );
}
