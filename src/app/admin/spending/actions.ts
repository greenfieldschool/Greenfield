"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { parseAmount, spendingError } from "@/lib/spending";
import {
  PaystackError,
  createRecipient,
  finalizeTransfer,
  initiateTransfer,
  namesMatch,
  paystackConfigured,
  resendOtp,
  resolveAccount,
  resultStatus,
  verifyTransfer
} from "@/lib/paystack";

// Spending request actions. Every change goes through a database function that checks permission, changes the
// status and writes the history (see the spending-requests skill). Nothing here trusts ids for permission.
// Paystack calls happen here on the server; only the service key may record what Paystack said.

const ID = /^[0-9a-f-]{36}$/i;

function go(path: string, message: string, type: "success" | "error" = "error"): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}toast=${encodeURIComponent(message)}&toast_type=${type}`);
}

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

function idFrom(fd: FormData, key = "id"): string {
  const v = str(fd, key);
  return ID.test(v) ? v : "";
}

async function client(back: string) {
  const supabase = getSupabaseServerClient();
  if (!supabase) go(back, "Database is not configured. Nothing was saved.");
  return supabase;
}

function done(path: string, message: string): never {
  revalidatePath("/admin/spending");
  revalidatePath(path);
  go(path, message, "success");
}

// ---------------------------------------------------------------------------------------------------------------
// Asking

export async function saveRequestAction(fd: FormData) {
  const id = idFrom(fd);
  const back = id ? `/admin/spending/new?edit=${id}` : "/admin/spending/new";
  const supabase = await client(back);
  const kind = str(fd, "kind");
  const payload: Record<string, unknown> = {
    id: id || null,
    kind,
    category_id: str(fd, "category_id"),
    purpose: str(fd, "purpose"),
    amount: parseAmount(fd.get("amount")),
    needed_by: str(fd, "needed_by") || null
  };
  const payeeId = idFrom(fd, "payee_id");
  if (payeeId) {
    payload.payee_id = payeeId;
  } else {
    const accountNumber = str(fd, "payee_account_number").replace(/\D/g, "");
    const bankCode = str(fd, "payee_bank_code");
    let accountName = str(fd, "payee_account_name") || null;
    let checked = false;
    // Check the name with the bank here on the server; the browser's check is only a convenience.
    if (bankCode && paystackConfigured() && /^\d{10}$/.test(accountNumber)) {
      try {
        accountName = await resolveAccount(accountNumber, bankCode);
        checked = true;
      } catch (e) {
        go(back, e instanceof PaystackError ? `${e.message} Check the bank and account number.` : "Couldn't check the account with the bank.");
      }
    }
    payload.payee = {
      name: str(fd, "payee_name"),
      bank_name: str(fd, "payee_bank_name"),
      bank_code: bankCode || null,
      account_number: accountNumber,
      account_name: accountName,
      checked
    };
  }
  if (kind !== "advance") {
    try {
      const receipts = JSON.parse(str(fd, "receipts") || "[]") as unknown[];
      payload.receipts = Array.isArray(receipts) ? receipts.slice(0, 6) : [];
    } catch {
      payload.receipts = [];
    }
  }
  const { data, error } = await supabase.rpc("spending_save_request", { p: payload });
  if (error) go(back, spendingError(error.message));
  done(`/admin/spending/${data}`, id ? "Changed and sent again for approval" : "Request sent. Approvers have been told.");
}

export async function cancelAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const supabase = await client(back);
  const { error } = await supabase.rpc("spending_cancel", { p_request: id, p_reason: str(fd, "reason"), p_note: str(fd, "note") || null });
  if (error) go(back, spendingError(error.message));
  done(back, "Request cancelled");
}

// ---------------------------------------------------------------------------------------------------------------
// Deciding

export async function decideAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const supabase = await client(back);
  const decision = str(fd, "decision");
  const { data, error } = await supabase.rpc("spending_decide", {
    p_request: id,
    p_decision: decision,
    p_reason: str(fd, "reason") || null,
    p_note: str(fd, "note") || null
  });
  if (error) go(back, spendingError(error.message));
  const msg =
    data === "approved"
      ? "Approved. The cashier has been told."
      : data === "first_approval"
        ? "Approved. It now needs a second approval."
        : decision === "decline"
          ? "Declined. The requester has been told why."
          : "Sent back. The requester has been told what to change.";
  done(back, msg);
}

// ---------------------------------------------------------------------------------------------------------------
// Paying out

export async function recordPayoutAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const supabase = await client(back);
  const slip = str(fd, "slip_path") || null;
  const { error } = await supabase.rpc("spending_record_payout", {
    p_request: id,
    p_method: str(fd, "method"),
    p_reference: str(fd, "reference") || null,
    p_slip: slip,
    p_charge: parseAmount(fd.get("charge")),
    p_note: str(fd, "note") || null
  });
  if (error) go(back, spendingError(error.message));
  done(back, "Payment recorded. The requester has been told.");
}

async function payerOnly(back: string) {
  const supabase = await client(back);
  const service = getSupabaseServiceClient();
  if (!service || !paystackConfigured()) go(back, "Paystack isn't connected yet. Record a payment made another way.");
  const { data: canPay } = await supabase.rpc("spending_can_pay");
  if (!canPay) go(back, "You don't have permission to pay out.");
  return { supabase, service };
}

async function record(service: NonNullable<ReturnType<typeof getSupabaseServiceClient>>, reference: string, status: string, code: string | null, message?: string | null) {
  const { data, error } = await service.rpc("spending_paystack_result", {
    p_reference: reference,
    p_status: status,
    p_transfer_code: code,
    p_message: message ?? null
  });
  if (error) throw new Error(spendingError(error.message));
  return data as string;
}

function paystackMessage(state: string): string {
  return state === "closed"
    ? "Paid through Paystack. The request is closed."
    : state === "paid"
      ? "Paid through Paystack. The requester has been told to bring receipts."
      : state === "failed"
        ? "The payment didn't go through. The request is back in To pay."
        : "Paystack is still processing it. Check again in a minute.";
}

export async function payPaystackAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const { supabase, service } = await payerOnly(back);
  const { data, error } = await supabase.rpc("spending_paystack_begin", { p_request: id, p_note: str(fd, "note") || null });
  if (error) go(back, spendingError(error.message));
  const info = data as {
    reference: string;
    amount: number;
    request_no: string;
    payee_id: string;
    name: string;
    bank_code: string;
    account_number: string;
    account_name: string | null;
    recipient_code: string | null;
    purpose: string;
  };

  let outcome: string;
  try {
    let recipient = info.recipient_code;
    if (!recipient) {
      const rc = await createRecipient({ name: info.account_name ?? info.name, accountNumber: info.account_number, bankCode: info.bank_code });
      if (!namesMatch(info.account_name, rc.accountName)) {
        throw new PaystackError(
          `The bank now gives the name "${rc.accountName}", not "${info.account_name}". Nothing was paid. Check with the requester, then send the request back.`
        );
      }
      const { error: recErr } = await service.rpc("spending_set_recipient", { p_payee: info.payee_id, p_code: rc.code, p_account_name: rc.accountName });
      if (recErr) throw new Error(spendingError(recErr.message));
      recipient = rc.code;
    }
    let state;
    try {
      state = await initiateTransfer({ amount: Number(info.amount), recipient, reference: info.reference, reason: `${info.request_no} ${info.purpose}` });
    } catch (e) {
      // The request may have reached Paystack even though the answer didn't reach us: ask before calling it failed,
      // so a retry can never pay twice.
      try {
        state = await verifyTransfer(info.reference);
      } catch {
        await record(service, info.reference, "pending", null, "Couldn't confirm with Paystack");
        go(back, `${e instanceof Error ? e.message : "Paystack didn't answer."} Press "Check with Paystack" before trying again.`);
      }
    }
    outcome = await record(service, info.reference, resultStatus(state.status), state.transferCode);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Paystack didn't accept the payment.";
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    await record(service, info.reference, "failed", null, message).catch(() => null);
    go(back, message);
  }
  if (outcome === "waiting") {
    revalidatePath(back);
    go(back, "Paystack has sent a code to the business phone. Type it below to finish the payment.", "success");
  }
  revalidatePath(back);
  go(back, paystackMessage(outcome), outcome === "failed" ? "error" : "success");
}

async function payingRequest(supabase: NonNullable<ReturnType<typeof getSupabaseServerClient>>, id: string, back: string) {
  const { data } = await supabase
    .from("spending_requests")
    .select("id, status, paystack_reference, paystack_transfer_code")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.status !== "paying" || !data.paystack_reference) go(back, "This request isn't being paid through Paystack.");
  return data as { id: string; status: string; paystack_reference: string; paystack_transfer_code: string | null };
}

export async function finalizeOtpAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const { supabase, service } = await payerOnly(back);
  const r = await payingRequest(supabase, id, back);
  const otp = str(fd, "otp").replace(/\s/g, "");
  if (!/^\d{4,8}$/.test(otp)) go(back, "Type the code Paystack sent (numbers only).");
  if (!r.paystack_transfer_code) go(back, "Paystack hasn't given a transfer code yet. Press Check with Paystack.");
  let outcome: string;
  try {
    const state = await finalizeTransfer(r.paystack_transfer_code, otp);
    outcome = await record(service, r.paystack_reference, resultStatus(state.status), state.transferCode);
  } catch (e) {
    go(back, e instanceof Error ? e.message : "Paystack didn't accept the code.");
  }
  revalidatePath(back);
  go(back, paystackMessage(outcome), outcome === "failed" ? "error" : "success");
}

export async function resendOtpAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const { supabase } = await payerOnly(back);
  const r = await payingRequest(supabase, id, back);
  if (!r.paystack_transfer_code) go(back, "Paystack hasn't given a transfer code yet. Press Check with Paystack.");
  try {
    await resendOtp(r.paystack_transfer_code);
  } catch (e) {
    go(back, e instanceof Error ? e.message : "Couldn't ask Paystack for a new code.");
  }
  go(back, "Paystack is sending a new code to the business phone.", "success");
}

export async function checkPaystackAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const { supabase, service } = await payerOnly(back);
  const r = await payingRequest(supabase, id, back);
  let outcome: string;
  try {
    const state = await verifyTransfer(r.paystack_reference);
    outcome = await record(service, r.paystack_reference, resultStatus(state.status), state.transferCode, state.reason);
  } catch (e) {
    go(back, e instanceof Error ? e.message : "Couldn't reach Paystack.");
  }
  revalidatePath(back);
  go(back, paystackMessage(outcome), outcome === "failed" ? "error" : "success");
}

/** Gives up on a Paystack payment that was never finished (no code typed). Asks Paystack first. */
export async function stopPaystackAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const { supabase, service } = await payerOnly(back);
  const r = await payingRequest(supabase, id, back);
  let outcome: string;
  try {
    let status = "abandoned";
    try {
      const state = await verifyTransfer(r.paystack_reference);
      status = ["success", "pending", "received", "processing"].includes(state.status) ? state.status : "abandoned";
    } catch (e) {
      if (!(e instanceof PaystackError) || !/not found/i.test(e.message)) throw e;
    }
    outcome = await record(service, r.paystack_reference, resultStatus(status), null, "Stopped by the cashier before the code was entered");
  } catch (e) {
    go(back, e instanceof Error ? e.message : "Couldn't reach Paystack. Nothing was changed.");
  }
  revalidatePath(back);
  go(back, outcome === "failed" ? "Stopped. Nothing was paid; the request is back in To pay." : paystackMessage(outcome), "success");
}

// ---------------------------------------------------------------------------------------------------------------
// Accounting for an advance

export async function addReceiptAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const supabase = await client(back);
  let rc: unknown = null;
  try {
    rc = (JSON.parse(str(fd, "receipts") || "[]") as unknown[])[0] ?? null;
  } catch {
    rc = null;
  }
  if (!rc) go(back, "Add the receipt's details.");
  const { error } = await supabase.rpc("spending_add_receipt", { p_request: id, rc });
  if (error) go(back, spendingError(error.message));
  done(back, "Receipt added");
}

export async function removeReceiptAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const supabase = await client(back);
  const { error } = await supabase.rpc("spending_remove_receipt", {
    p_receipt: idFrom(fd, "receipt_id"),
    p_reason: str(fd, "reason"),
    p_note: str(fd, "note") || null
  });
  if (error) go(back, spendingError(error.message));
  done(back, "Receipt taken off");
}

export async function sendAccountingAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const supabase = await client(back);
  const change = Number(str(fd, "change").replace(/[₦,\s]/g, "") || "0");
  const { error } = await supabase.rpc("spending_send_accounting", { p_request: id, p_change: Number.isFinite(change) ? change : -1 });
  if (error) go(back, spendingError(error.message));
  done(back, "Sent for checking. The cashier has been told.");
}

export async function checkAccountingAction(fd: FormData) {
  const id = idFrom(fd);
  const back = `/admin/spending/${id}`;
  const supabase = await client(back);
  const decision = str(fd, "decision");
  const { error } = await supabase.rpc("spending_check_accounting", {
    p_request: id,
    p_decision: decision,
    p_reason: str(fd, "reason") || null,
    p_note: str(fd, "note") || null
  });
  if (error) go(back, spendingError(error.message));
  done(back, decision === "accept" ? "Accepted. The receipts are now expense records and the request is closed." : "Sent back to the requester.");
}

// ---------------------------------------------------------------------------------------------------------------
// Permissions, settings, wallet, email

export async function setPermissionAction(fd: FormData) {
  const back = "/admin/spending/settings";
  const supabase = await client(back);
  const user = idFrom(fd, "user_id");
  if (!user) go(back, "Choose a member of staff.");
  const { error } = await supabase.rpc("spending_set_permission", {
    p_user: user,
    p_approve_up_to: parseAmount(fd.get("approve_up_to")) || null,
    p_can_pay: fd.get("can_pay") === "on",
    p_note: str(fd, "note") || null
  });
  if (error) go(back, spendingError(error.message));
  done(back, "Spending permission saved");
}

export async function saveSettingsAction(fd: FormData) {
  const back = "/admin/spending/settings";
  const supabase = await client(back);
  const p: Record<string, string | number | null> = {};
  for (const k of ["second_approval_above", "approver_may_pay_up_to", "no_receipt_max", "split_check_amount"]) {
    const n = parseAmount(fd.get(k));
    if (n > 0 || str(fd, k) === "0") p[k] = n;
  }
  const days = Math.floor(Number(str(fd, "account_within_days")));
  if (days >= 1 && days <= 30) p.account_within_days = days;
  p.low_balance_alert = str(fd, "low_balance_alert") ? parseAmount(fd.get("low_balance_alert")) : null;
  const { error } = await supabase.rpc("spending_save_settings", { p });
  if (error) go(back, spendingError(error.message));
  done(back, "Settings saved");
}

export async function recordTopupAction(fd: FormData) {
  const back = "/admin/spending/wallet";
  const supabase = await client(back);
  const { error } = await supabase.rpc("spending_record_topup", {
    p_amount: parseAmount(fd.get("amount")),
    p_on: str(fd, "topped_on") || null,
    p_reference: str(fd, "reference") || null,
    p_note: str(fd, "note") || null
  });
  if (error) go(back, spendingError(error.message));
  done(back, "Top-up recorded");
}

export async function voidTopupAction(fd: FormData) {
  const back = "/admin/spending/wallet";
  const supabase = await client(back);
  const { error } = await supabase.rpc("spending_void_topup", { p_id: idFrom(fd), p_reason: str(fd, "reason"), p_note: str(fd, "note") || null });
  if (error) go(back, spendingError(error.message));
  done(back, "Top-up marked as a mistake");
}

export async function emailPreferenceAction(fd: FormData) {
  const back = "/admin/spending";
  const supabase = await client(back);
  const { data } = await supabase.auth.getUser();
  if (!data.user) go(back, "Please sign in again.");
  const on = str(fd, "on") === "1";
  const { error } = await supabase
    .from("email_preferences")
    .upsert({ user_id: data.user.id, spending: on, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  if (error) go(back, spendingError(error.message));
  done(back, on ? "You'll get emails about spending requests" : "Spending request emails are off. The counts on the dashboard still show what's waiting.");
}

export async function voidExpenseAction(fd: FormData) {
  const back = "/admin/finance/expenses";
  const supabase = await client(back);
  const { error } = await supabase.rpc("finance_void_expense", { p_id: idFrom(fd), p_reason: str(fd, "reason"), p_note: str(fd, "note") || null });
  if (error) go(back, spendingError(error.message));
  revalidatePath(back);
  go(back, "Expense voided. It stays on record, marked as a mistake.", "success");
}
