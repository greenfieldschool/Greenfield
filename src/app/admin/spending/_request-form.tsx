"use client";

import { useState } from "react";
import { BadgeCheck, Loader2 } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import { SpendingReceipts } from "@/components/spending-receipts";
import { KINDS, naira, type SpendingKind } from "@/lib/spending";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export type CategoryFigure = { id: string; name: string; budget: number | null; spent: number; committed: number };
export type PayeeOption = { id: string; name: string; bank_name: string; account_number: string; account_name: string | null; bank_code: string | null };
export type Bank = { name: string; code: string };

type Initial = {
  id: string;
  kind: SpendingKind;
  category_id: string;
  purpose: string;
  amount: number;
  needed_by: string | null;
  payee_id: string;
};

function BankFields({ banks, paystackOn, prefix }: { banks: Bank[]; paystackOn: boolean; prefix: string }) {
  const [bankCode, setBankCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [account, setAccount] = useState("");
  const [checked, setChecked] = useState<{ name: string; for: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const key = `${bankCode}:${account}`;
  const name = checked && checked.for === key ? checked.name : null;

  async function check() {
    setProblem(null);
    if (!/^\d{10}$/.test(account)) {
      setProblem("The account number must be 10 digits.");
      return;
    }
    if (!bankCode) {
      setProblem("Choose the bank first.");
      return;
    }
    setChecking(true);
    try {
      const res = await fetch(`/api/spending/resolve-account?account=${account}&bank=${encodeURIComponent(bankCode)}`);
      const body = (await res.json()) as { name?: string; error?: string };
      if (body.name) setChecked({ name: body.name, for: key });
      else setProblem(body.error ?? "The bank didn't recognise that account.");
    } catch {
      setProblem("Couldn't check the name just now. You can still send the request.");
    }
    setChecking(false);
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name={`${prefix}bank_name`} value={banks.length ? banks.find((b) => b.code === bankCode)?.name ?? "" : bankName} />
      <input type="hidden" name={`${prefix}bank_code`} value={banks.length ? bankCode : ""} />
      <input type="hidden" name={`${prefix}account_name`} value={name ?? ""} />
      <label className="block">
        <span className="gf-label">Bank</span>
        {banks.length ? (
          <select className="gf-select" required value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
            <option value="">Choose the bank…</option>
            {banks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        ) : (
          <input className="gf-input" required maxLength={80} value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. GTBank" />
        )}
      </label>
      <label className="block">
        <span className="gf-label">Account number (10 digits)</span>
        <input
          className="gf-input tabular-nums"
          name={`${prefix}account_number`}
          inputMode="numeric"
          pattern="[0-9]{10}"
          maxLength={10}
          required
          value={account}
          onChange={(e) => setAccount(e.target.value.replace(/\D/g, "").slice(0, 10))}
        />
      </label>
      {paystackOn && banks.length ? (
        <div className="sm:col-span-2 flex flex-wrap items-center gap-3">
          <button type="button" onClick={check} className={buttonClasses({ variant: "secondary", size: "sm" })} disabled={checking}>
            {checking ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <BadgeCheck className="h-4 w-4" aria-hidden="true" />}
            Check the account name
          </button>
          {name ? (
            <span className="text-sm font-semibold text-brand-green-700" role="status">
              The bank says: {name}
            </span>
          ) : (
            <span className="gf-hint">The name is checked again with the bank when you send.</span>
          )}
          {problem ? (
            <span className="text-sm text-red-600" role="alert">
              {problem}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="gf-hint sm:col-span-2">Bank names can&apos;t be checked until Paystack is connected. The cashier will check before paying.</p>
      )}
    </div>
  );
}

export function RequestForm({
  action,
  categories,
  banks,
  paystackOn,
  myAccount,
  suppliers,
  initial
}: {
  action: (fd: FormData) => Promise<void>;
  categories: CategoryFigure[];
  banks: Bank[];
  paystackOn: boolean;
  myAccount: PayeeOption | null;
  suppliers: PayeeOption[];
  initial?: Initial | null;
}) {
  const [kind, setKind] = useState<SpendingKind>(initial?.kind ?? "advance");
  const [categoryId, setCategoryId] = useState(initial?.category_id ?? "");
  const [useSaved, setUseSaved] = useState(Boolean(myAccount));
  const [supplierId, setSupplierId] = useState(() =>
    initial && suppliers.some((s) => s.id === initial.payee_id) ? initial.payee_id : suppliers.length ? "" : "new"
  );
  const cat = categories.find((c) => c.id === categoryId);
  const left = cat && cat.budget != null ? cat.budget - cat.spent - cat.committed : null;
  const supplier = suppliers.find((s) => s.id === supplierId);

  return (
    <form action={action} className="space-y-6">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}
      <input type="hidden" name="kind" value={kind} />

      <fieldset className="space-y-3">
        <legend className="gf-label">What kind of request?</legend>
        <div className="grid gap-3 sm:grid-cols-3">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={kind === k.value}
              onClick={() => setKind(k.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-green-500/30",
                kind === k.value ? "border-brand-green bg-brand-green-50 ring-1 ring-brand-green" : "border-slate-200 hover:border-slate-300"
              )}
            >
              <span className="block text-sm font-semibold text-slate-900">{k.label}</span>
              <span className="mt-1 block text-xs text-slate-600">{k.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="gf-label">What is it for? (category)</span>
          <select className="gf-select" name="category_id" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {cat ? (
            <span className={cn("gf-hint mt-1 block", left != null && left < 0 ? "text-red-600" : "")}>
              {left != null
                ? `${naira(Math.max(left, 0))} of this term's ${naira(cat.budget)} budget left${left < 0 ? " (already over)" : ""}.`
                : `${naira(cat.spent)} spent on this so far this term.`}
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="gf-label">Amount (₦)</span>
          <input
            className="gf-input text-right tabular-nums"
            name="amount"
            inputMode="decimal"
            required
            defaultValue={initial ? String(initial.amount) : ""}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="gf-label">Say what you&apos;ll buy or pay for</span>
          <textarea className="gf-input min-h-[80px]" name="purpose" required maxLength={500} defaultValue={initial?.purpose ?? ""} placeholder="e.g. 50 litres of diesel for the generator this week" />
        </label>
        <label className="block">
          <span className="gf-label">Needed by (optional)</span>
          <input className="gf-input" type="date" name="needed_by" defaultValue={initial?.needed_by ?? ""} />
        </label>
      </div>

      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">{kind === "supplier" ? "Pay this supplier" : "Pay into your account"}</legend>
        {kind === "supplier" ? (
          <>
            {suppliers.length ? (
              <label className="block">
                <span className="gf-label">Supplier</span>
                <select className="gf-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
                  <option value="">Choose a saved supplier…</option>
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {s.bank_name} ····{s.account_number.slice(-4)}
                    </option>
                  ))}
                  <option value="new">A new supplier, or new bank details</option>
                </select>
              </label>
            ) : null}
            {supplier ? (
              <>
                <input type="hidden" name="payee_id" value={supplier.id} />
                <p className="text-sm text-slate-700">
                  {supplier.account_name ?? supplier.name} · {supplier.bank_name} {supplier.account_number}
                </p>
              </>
            ) : supplierId === "new" ? (
              <>
                <label className="block">
                  <span className="gf-label">Supplier&apos;s name</span>
                  <input className="gf-input" name="payee_name" required maxLength={120} />
                </label>
                <BankFields banks={banks} paystackOn={paystackOn} prefix="payee_" />
              </>
            ) : null}
          </>
        ) : myAccount && useSaved ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <input type="hidden" name="payee_id" value={myAccount.id} />
            <p className="text-sm text-slate-700">
              {myAccount.account_name ?? myAccount.name} · {myAccount.bank_name} {myAccount.account_number}
            </p>
            <button type="button" className={buttonClasses({ variant: "ghost", size: "sm" })} onClick={() => setUseSaved(false)}>
              Use a different account
            </button>
          </div>
        ) : (
          <>
            <BankFields banks={banks} paystackOn={paystackOn} prefix="payee_" />
            {myAccount ? (
              <p className="gf-hint">
                These details will replace your saved account. The approver is told the details are new.{" "}
                <button type="button" className="gf-link" onClick={() => setUseSaved(true)}>
                  Keep my saved account
                </button>
              </p>
            ) : (
              <p className="gf-hint">Saved for next time. Payments only go to an account in your own name.</p>
            )}
          </>
        )}
      </fieldset>

      {kind !== "advance" ? (
        <fieldset className="space-y-2">
          <legend className="gf-label">{kind === "supplier" ? "The supplier's invoice or quote" : "Your receipt"}</legend>
          <SpendingReceipts mode="request" />
          <p className="gf-hint">The receipts must add up to the amount.</p>
        </fieldset>
      ) : (
        <p className="gf-hint">After you&apos;re paid, add your receipts and any change within the days the school allows.</p>
      )}

      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingText="Sending…">{initial ? "Send it again" : "Send the request"}</SubmitButton>
      </div>
    </form>
  );
}
