"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Copy, KeyRound, Loader2, Printer, UserPlus, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { createAccountsAction, resetPasswordsAction, type AccountActionResult, type AccountKind, type AccountResultRow } from "./actions";

export type AccountRow = {
  id: string;
  name: string;
  /** Admission number (pupils) or email (parents). */
  username: string | null;
  href: string;
  sub: string | null;
  className: string | null;
  hasAccount: boolean;
  lastSignIn: string | null;
  lastSignInLabel: string;
  createdLabel: string | null;
  warning: string | null;
  canCreate: boolean;
  cannotCreateReason: string | null;
};

const PORTAL_URL = "greenfieldschool.ng/portal";

export function AccountsTable({
  kind,
  rows,
  schoolName,
  printedBy
}: {
  kind: AccountKind;
  rows: AccountRow[];
  schoolName: string;
  printedBy: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<"create" | "reset" | null>(null);
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const allIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = selected.size > 0 && selected.size === rows.length;
  const chosen = rows.filter((r) => selected.has(r.id));
  const toCreate = chosen.filter((r) => !r.hasAccount && r.canCreate);
  const toReset = chosen.filter((r) => r.hasAccount);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function run(which: "create" | "reset") {
    const ids = (which === "create" ? toCreate : toReset).map((r) => r.id);
    if (!ids.length) return;
    setBusy(which);
    setConfirmReset(false);
    startTransition(async () => {
      const res = which === "create" ? await createAccountsAction(kind, ids) : await resetPasswordsAction(kind, ids);
      setResult(res);
      setBusy(null);
      // Keep only what still needs doing selected, so "press again to continue" just works.
      const done = new Set(res.rows.map((r) => r.id));
      setSelected((prev) => new Set(Array.from(prev).filter((id) => !done.has(id))));
    });
  }

  const who = kind === "pupil" ? "pupil" : "parent";

  return (
    <div>
      {result ? <OneTimePasswords result={result} kind={kind} schoolName={schoolName} printedBy={printedBy} onClose={() => setResult(null)} /> : null}

      <div className={cn(result && "print:hidden")}>
        {/* Bulk bar: appears when something is chosen; sticky so it stays in reach on long lists. */}
        <div
          className={cn(
            "sticky top-2 z-10 mb-3 flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
            selected.size ? "border-brand-green-200 bg-brand-green-50/95 shadow-sm backdrop-blur" : "border-slate-200 bg-white"
          )}
          role="region"
          aria-label="Actions for the chosen people"
        >
          <span className="mr-auto font-medium text-slate-700" aria-live="polite">
            {selected.size ? `${selected.size} chosen` : `Tick ${who}s to create accounts or reset passwords`}
          </span>
          {selected.size ? (
            <button type="button" className={buttonClasses({ variant: "ghost", size: "sm" })} onClick={() => setSelected(new Set())}>
              Clear
            </button>
          ) : null}
          <button
            type="button"
            className={buttonClasses({ size: "sm" })}
            disabled={!toCreate.length || pending}
            onClick={() => run("create")}
          >
            {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
            Create {toCreate.length || ""} account{toCreate.length === 1 ? "" : "s"}
          </button>
          {confirmReset ? (
            <span className="flex flex-wrap items-center gap-2 rounded-lg bg-white px-2 py-1 ring-1 ring-brand-gold-200">
              <span className="text-slate-700">
                Their current password{toReset.length === 1 ? "" : "s"} will stop working.
              </span>
              <button type="button" className={buttonClasses({ variant: "gold", size: "sm" })} disabled={pending} onClick={() => run("reset")}>
                Yes, reset {toReset.length}
              </button>
              <button type="button" className={buttonClasses({ variant: "ghost", size: "sm" })} onClick={() => setConfirmReset(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              className={buttonClasses({ variant: "secondary", size: "sm" })}
              disabled={!toReset.length || pending}
              onClick={() => setConfirmReset(true)}
            >
              {busy === "reset" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
              Reset {toReset.length || ""} password{toReset.length === 1 ? "" : "s"}
            </button>
          )}
        </div>

        {/* Phones: one card per person. */}
        <ul className="space-y-2 md:hidden">
          <li className="flex items-center gap-3 px-1 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-5 w-5 rounded border-slate-300 text-brand-green focus:ring-brand-green"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))}
              aria-label={`Choose all ${rows.length} shown`}
            />
            Choose all {rows.length} shown
          </li>
          {rows.map((r) => (
            <li key={r.id} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 text-brand-green focus:ring-brand-green"
                checked={selected.has(r.id)}
                onChange={() => toggle(r.id)}
                aria-label={`Choose ${r.name}`}
              />
              <div className="min-w-0 flex-1">
                <Link href={r.href} className="font-semibold text-slate-900 hover:text-brand-green">
                  {r.name}
                </Link>
                <div className="mt-0.5 break-all font-mono text-xs text-slate-600">{r.username ?? "No number yet"}</div>
                {r.sub ? <div className="text-xs text-slate-500">{r.sub}</div> : null}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                  <AccountBadge row={r} />
                  {r.hasAccount ? <span className="text-slate-500">{r.lastSignInLabel}</span> : null}
                </div>
                {r.warning ? <p className="mt-1 text-xs text-amber-700">{r.warning}</p> : null}
              </div>
            </li>
          ))}
        </ul>

        {/* Wider screens: a table. */}
        <div className="gf-table-wrap hidden md:block">
          <table className="gf-table">
            <thead>
              <tr>
                <th scope="col" className="w-10">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-green focus:ring-brand-green"
                    checked={allSelected}
                    onChange={() => setSelected(allSelected ? new Set() : new Set(allIds))}
                    aria-label={`Choose all ${rows.length} shown`}
                  />
                </th>
                <th scope="col">{kind === "pupil" ? "Pupil" : "Parent"}</th>
                <th scope="col">{kind === "pupil" ? "Admission number (signs in with)" : "Email (signs in with)"}</th>
                <th scope="col">{kind === "pupil" ? "Class" : "Children"}</th>
                <th scope="col">Portal account</th>
                <th scope="col">Last signed in</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={cn(selected.has(r.id) && "bg-brand-green-50/50")}>
                  <td>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-brand-green focus:ring-brand-green"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label={`Choose ${r.name}`}
                    />
                  </td>
                  <td>
                    <Link href={r.href} className="font-medium text-slate-900 hover:text-brand-green">
                      {r.name}
                    </Link>
                    {r.warning ? <div className="text-xs text-amber-700">{r.warning}</div> : null}
                  </td>
                  <td className="font-mono text-xs">{r.username ?? <span className="font-sans text-slate-400">No number yet</span>}</td>
                  <td className="text-slate-600">{r.sub ?? "—"}</td>
                  <td>
                    <AccountBadge row={r} />
                    {r.createdLabel ? <div className="mt-0.5 text-xs text-slate-500">Made {r.createdLabel}</div> : null}
                  </td>
                  <td className="text-slate-600" title={r.lastSignIn ?? undefined}>
                    {r.hasAccount ? r.lastSignInLabel : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AccountBadge({ row }: { row: AccountRow }) {
  if (row.hasAccount) {
    return row.lastSignIn ? <Badge tone="green">Has account</Badge> : <Badge tone="blue">Has account · never used</Badge>;
  }
  if (!row.canCreate) return <Badge tone="slate">{row.cannotCreateReason ?? "Can't create yet"}</Badge>;
  return <Badge tone="gold">No account</Badge>;
}

/** The passwords just set: shown once, with copy and printable login slips. Nothing here is saved anywhere. */
function OneTimePasswords({
  result,
  kind,
  schoolName,
  printedBy,
  onClose
}: {
  result: AccountActionResult;
  kind: AccountKind;
  schoolName: string;
  printedBy: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  // While slips are open, printing prints only the slips (see .gf-print-slips in globals.css).
  useEffect(() => {
    document.body.classList.add("gf-print-slips");
    return () => document.body.classList.remove("gf-print-slips");
  }, []);
  const withPassword = result.rows.filter((r) => r.password);
  const others = result.rows.filter((r) => !r.password);
  const today = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" }).format(new Date());

  async function copyAll() {
    const text = withPassword
      .map((r) => `${r.name}${r.className ? ` (${r.className})` : ""}\t${r.username ?? ""}\t${r.password}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section
      className="mb-5 rounded-2xl border border-brand-green-200 bg-white shadow-sm animate-fade-up print:mb-0 print:border-0 print:shadow-none"
      aria-labelledby="otp-title"
    >
      <div className="flex flex-wrap items-start gap-3 border-b border-slate-100 px-5 py-4 print:hidden">
        <CheckCircle2 className="mt-0.5 h-5 w-5 text-brand-green" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 id="otp-title" className="font-semibold text-slate-900">
            {result.message}
          </h2>
          {withPassword.length ? (
            <p className="mt-0.5 text-sm text-slate-600">
              Write these down or print the slips now. <strong>They will not be shown again</strong>: for safety the
              school can&apos;t see passwords later, only set new ones. Each person is asked to choose their own
              password when they first sign in.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {withPassword.length ? (
            <>
              <button type="button" className={buttonClasses({ variant: "secondary", size: "sm" })} onClick={copyAll}>
                <Copy className="h-4 w-4" aria-hidden="true" />
                {copied ? "Copied" : "Copy all"}
              </button>
              <button type="button" className={buttonClasses({ size: "sm" })} onClick={() => window.print()}>
                <Printer className="h-4 w-4" aria-hidden="true" />
                Print login slips
              </button>
            </>
          ) : null}
          <button type="button" className={buttonClasses({ variant: "ghost", size: "sm" })} onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {!result.ok ? (
        <div className="p-5 print:hidden">
          <Alert tone="danger">{result.message}</Alert>
        </div>
      ) : null}

      {withPassword.length ? (
        <div className="gf-table-wrap print:hidden">
          <table className="gf-table">
            <thead>
              <tr>
                <th scope="col">{kind === "pupil" ? "Pupil" : "Parent"}</th>
                <th scope="col">Signs in with</th>
                <th scope="col">Temporary password</th>
              </tr>
            </thead>
            <tbody>
              {withPassword.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium text-slate-900">
                    {r.name}
                    {r.className ? <span className="ml-1 text-xs font-normal text-slate-500">{r.className}</span> : null}
                  </td>
                  <td className="break-all font-mono text-sm">{r.username}</td>
                  <td>
                    <span className="select-all rounded-md bg-brand-gold-50 px-2 py-1 font-mono text-base font-semibold tracking-wide text-slate-900 ring-1 ring-brand-gold-200">
                      {r.password}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {others.length ? (
        <ul className="space-y-1 px-5 py-3 text-sm print:hidden">
          {others.map((r) => (
            <li key={r.id} className="flex flex-wrap gap-x-2">
              <span className="font-medium text-slate-800">{r.name}</span>
              <span className={r.status === "failed" ? "text-red-700" : "text-slate-500"}>{r.note}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Printed: slips, three to a column, with cut lines. Only this prints while the panel is open. */}
      <div className="gf-slips hidden print:block">
        <div className="grid grid-cols-2 gap-0">
          {withPassword.map((r) => (
            <LoginSlip key={r.id} row={r} kind={kind} schoolName={schoolName} />
          ))}
        </div>
        <p className="mt-3 text-[9pt] text-slate-500">
          Printed {today} by {printedBy}. Keep these slips safe and hand each one only to the person named on it.
        </p>
      </div>
    </section>
  );
}

function LoginSlip({ row, kind, schoolName }: { row: AccountResultRow; kind: AccountKind; schoolName: string }) {
  return (
    <div className="break-inside-avoid border border-dashed border-slate-400 p-4 text-[10pt] leading-snug text-black">
      <div className="flex items-baseline justify-between gap-2 border-b border-slate-300 pb-1.5">
        <strong className="text-[11pt]">{schoolName}</strong>
        <span className="text-[8.5pt]">{kind === "pupil" ? "Pupil portal" : "Parent portal"}</span>
      </div>
      <div className="mt-2">
        <div className="text-[12pt] font-bold">{row.name}</div>
        {row.className ? <div className="text-[9pt]">{row.className}</div> : null}
      </div>
      <dl className="mt-2 space-y-1">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">Website</dt>
          <dd className="font-mono">{PORTAL_URL}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">{kind === "pupil" ? "Admission no." : "Email"}</dt>
          <dd className="break-all font-mono font-semibold">{row.username}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-24 shrink-0">Password</dt>
          <dd className="font-mono text-[12pt] font-bold tracking-wide">{row.password}</dd>
        </div>
      </dl>
      <p className="mt-2 text-[8.5pt]">
        {kind === "pupil" ? "Choose “I’m a student”. " : "Choose “I’m a parent”. "}You will be asked to choose your own
        password. Forgot it? Ask the school office.
      </p>
    </div>
  );
}

/**
 * One person's account buttons, for the pupil and parent pages: create the account, or give a new temporary
 * password. The password is shown once with a printable slip, exactly as on Accounts & passwords.
 */
export function AccountQuickActions({
  kind,
  id,
  hasAccount,
  canCreate,
  cannotCreateReason,
  schoolName,
  printedBy
}: {
  kind: AccountKind;
  id: string;
  hasAccount: boolean;
  canCreate: boolean;
  cannotCreateReason?: string | null;
  schoolName: string;
  printedBy: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<AccountActionResult | null>(null);
  const [confirm, setConfirm] = useState(false);

  function run(which: "create" | "reset") {
    setConfirm(false);
    startTransition(async () => {
      setResult(which === "create" ? await createAccountsAction(kind, [id]) : await resetPasswordsAction(kind, [id]));
    });
  }

  return (
    <div className="space-y-3">
      {result ? <OneTimePasswords result={result} kind={kind} schoolName={schoolName} printedBy={printedBy} onClose={() => setResult(null)} /> : null}
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        {hasAccount ? (
          confirm ? (
            <>
              <span className="text-sm text-slate-700">The current password will stop working.</span>
              <button type="button" className={buttonClasses({ variant: "gold", size: "sm" })} disabled={pending} onClick={() => run("reset")}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                Yes, give a new password
              </button>
              <button type="button" className={buttonClasses({ variant: "ghost", size: "sm" })} onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className={buttonClasses({ variant: "secondary", size: "sm" })} disabled={pending} onClick={() => setConfirm(true)}>
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Give a new temporary password
            </button>
          )
        ) : canCreate ? (
          <button type="button" className={buttonClasses({ size: "sm" })} disabled={pending} onClick={() => run("create")}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
            Create portal account
          </button>
        ) : (
          <span className="text-sm text-slate-600">{cannotCreateReason}</span>
        )}
      </div>
    </div>
  );
}
