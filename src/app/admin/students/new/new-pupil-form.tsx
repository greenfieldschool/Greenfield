"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState } from "react-dom";
import Link from "next/link";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import SubmitButton from "@/components/submit-button";
import { Alert } from "@/components/ui/alert";
import { Field } from "@/components/ui/form-section";
import { buttonClasses } from "@/components/ui/button";
import { PossibleDuplicates } from "@/components/possible-duplicates";
import type { PossibleDuplicate } from "@/lib/pupil-intake";
import { checkAdmissionNumberAction, createPupilAction, findDuplicatesAction, type NewPupilState } from "./actions";

type ClassOption = { id: string; name: string; level: string };

const initial: NewPupilState = { error: null, duplicates: [] };

/** Waits until typing pauses before asking the server (saves data on slow connections). */
function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function NewPupilForm({ classes, nextNumber }: { classes: ClassOption[]; nextNumber: string | null }) {
  const [state, formAction] = useFormState(createPupilAction, initial);
  const [who, setWho] = useState({ first: "", last: "", dob: "", phone: "", email: "" });
  const [dups, setDups] = useState<PossibleDuplicate[]>([]);
  const [checking, setChecking] = useState(false);
  const [mode, setMode] = useState<"auto" | "keep">("auto");
  const [number, setNumber] = useState("");
  const [numberCheck, setNumberCheck] = useState<{ state: "idle" | "checking" | "free" | "taken"; tidy?: string; owner?: { id: string; name: string } | null }>({ state: "idle" });
  const formRef = useRef<HTMLFormElement>(null);

  const debouncedWho = useDebounced(who, 500);
  const debouncedNumber = useDebounced(number, 450);

  // Live duplicate check once there is enough to go on.
  useEffect(() => {
    const { first, last, phone, email } = debouncedWho;
    const enough = (first.trim().length >= 2 && last.trim().length >= 2) || phone.replace(/\D/g, "").length >= 7 || email.includes("@");
    if (!enough) {
      setDups([]);
      return;
    }
    let cancelled = false;
    setChecking(true);
    findDuplicatesAction(debouncedWho)
      .then((rows) => {
        if (!cancelled) setDups(rows);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedWho]);

  // Live check of an existing number.
  useEffect(() => {
    if (mode !== "keep" || !debouncedNumber.trim()) {
      setNumberCheck({ state: "idle" });
      return;
    }
    let cancelled = false;
    setNumberCheck({ state: "checking" });
    checkAdmissionNumberAction(debouncedNumber).then((r) => {
      if (!cancelled) setNumberCheck({ state: r.owner ? "taken" : "free", tidy: r.tidy, owner: r.owner });
    });
    return () => {
      cancelled = true;
    };
  }, [debouncedNumber, mode]);

  // After a refused save, move focus to the field that needs attention.
  useEffect(() => {
    if (!state.error) return;
    const el = state.field ? formRef.current?.querySelector<HTMLElement>(`[name="${state.field}"]`) : null;
    (el ?? formRef.current?.querySelector<HTMLElement>("[data-form-error]"))?.focus();
  }, [state]);

  const shown = state.duplicates.length ? state.duplicates : dups;
  const strong = shown.some((d) => d.strength >= 50);
  const set = (k: keyof typeof who) => (e: React.ChangeEvent<HTMLInputElement>) => setWho((w) => ({ ...w, [k]: e.target.value }));

  return (
    <form ref={formRef} action={formAction} className="space-y-6" noValidate>
      {state.error ? (
        <div tabIndex={-1} data-form-error className="outline-none">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      ) : null}

      <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <legend className="px-1 text-base font-semibold text-slate-900">The pupil</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="First name" htmlFor="np-first">
            <input id="np-first" name="first_name" className="gf-input" autoComplete="off" required value={who.first} onChange={set("first")} />
          </Field>
          <Field label="Middle name (optional)" htmlFor="np-middle">
            <input id="np-middle" name="middle_name" className="gf-input" autoComplete="off" />
          </Field>
          <Field label="Surname" htmlFor="np-last">
            <input id="np-last" name="last_name" className="gf-input" autoComplete="off" required value={who.last} onChange={set("last")} />
          </Field>
        </div>
        {/* Duplicates show up right where the person is typing, before they get to the save button. */}
        <div aria-live="polite" className="min-h-[1px]">
          {checking && !shown.length ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Checking whether this child is already on the system…
            </p>
          ) : null}
          <PossibleDuplicates rows={shown} />
          {strong ? (
            <label className="mt-3 flex items-start gap-3 rounded-xl bg-white px-4 py-3 text-sm ring-1 ring-amber-300">
              <input type="checkbox" name="confirm_different" className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-green focus:ring-brand-green" />
              <span>
                <strong>This is a different child.</strong> I&apos;ve checked the records above. (Your name is recorded with this choice.)
              </span>
            </label>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date of birth" htmlFor="np-dob" hint="Helps spot the same child entered twice.">
            <input id="np-dob" name="date_of_birth" type="date" className="gf-input" value={who.dob} onChange={set("dob")} />
          </Field>
          <Field label="Sex (optional)" htmlFor="np-sex">
            <select id="np-sex" name="sex" className="gf-select" defaultValue="">
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </Field>
          <Field label="Class" htmlFor="np-class" hint="The section (creche, primary, secondary) follows the class.">
            <select id="np-class" name="class_id" className="gf-select" defaultValue="">
              <option value="">No class yet</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Status" htmlFor="np-status">
          <select id="np-status" name="status" className="gf-select sm:max-w-xs" defaultValue="enrolled">
            <option value="enrolled">Enrolled (starting soon)</option>
            <option value="active">Active (already attending)</option>
          </select>
        </Field>
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <legend className="px-1 text-base font-semibold text-slate-900">Admission number</legend>
        <input type="hidden" name="number_mode" value={mode} />
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Admission number">
          <button
            type="button"
            role="radio"
            aria-checked={mode === "auto"}
            onClick={() => setMode("auto")}
            className={`rounded-xl p-4 text-left ring-1 transition ${mode === "auto" ? "bg-brand-green-50 ring-2 ring-brand-green" : "bg-white ring-slate-200 hover:ring-slate-300"}`}
          >
            <div className="font-semibold text-slate-900">Give the next number</div>
            <div className="mt-0.5 text-sm text-slate-600">
              New to the school. They will get <span className="font-mono font-semibold">{nextNumber ?? "the next number"}</span>
              {nextNumber ? " (or the one after, if someone saves first)" : ""}.
            </div>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === "keep"}
            onClick={() => setMode("keep")}
            className={`rounded-xl p-4 text-left ring-1 transition ${mode === "keep" ? "bg-brand-green-50 ring-2 ring-brand-green" : "bg-white ring-slate-200 hover:ring-slate-300"}`}
          >
            <div className="font-semibold text-slate-900">Keep their existing number</div>
            <div className="mt-0.5 text-sm text-slate-600">Moving over from the old portal or records.</div>
          </button>
        </div>
        {mode === "keep" ? (
          <Field label="Their admission number" htmlFor="np-adm">
            <input
              id="np-adm"
              name="admission_number"
              className="gf-input font-mono uppercase sm:max-w-xs"
              autoCapitalize="characters"
              spellCheck={false}
              autoComplete="off"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              aria-describedby="np-adm-status"
              aria-invalid={numberCheck.state === "taken" || undefined}
            />
            <p id="np-adm-status" className="mt-1.5 flex min-h-[20px] items-center gap-1.5 text-sm" aria-live="polite">
              {numberCheck.state === "checking" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
                  <span className="text-slate-500">Checking…</span>
                </>
              ) : numberCheck.state === "free" ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-brand-green" aria-hidden="true" />
                  <span className="text-brand-green-700">
                    Free. It will be saved as <span className="font-mono font-semibold">{numberCheck.tidy}</span>.
                  </span>
                </>
              ) : numberCheck.state === "taken" && numberCheck.owner ? (
                <>
                  <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
                  <span className="text-red-700">
                    Already used by{" "}
                    <Link href={`/admin/students/${numberCheck.owner.id}`} className="font-semibold underline" target="_blank">
                      {numberCheck.owner.name}
                    </Link>
                    . If that is this child, open their record instead.
                  </span>
                </>
              ) : (
                <span className="text-slate-500">GRE/2026/7, gre 2026 007 and GRE/2026/007 count as the same number.</span>
              )}
            </p>
          </Field>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <legend className="px-1 text-base font-semibold text-slate-900">Parent or guardian (optional)</legend>
        <p className="-mt-2 text-sm text-slate-600">
          If this parent is already on the system (same email or phone), the child is linked to them instead of making
          a second parent record.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="np-pname">
            <input id="np-pname" name="parent_name" className="gf-input" autoComplete="off" />
          </Field>
          <Field label="Relationship" htmlFor="np-rel">
            <select id="np-rel" name="relationship" className="gf-select" defaultValue="">
              <option value="">—</option>
              <option value="mother">Mother</option>
              <option value="father">Father</option>
              <option value="guardian">Guardian</option>
            </select>
          </Field>
          <Field label="Phone" htmlFor="np-phone">
            <input id="np-phone" name="parent_phone" type="tel" inputMode="tel" className="gf-input" autoComplete="off" value={who.phone} onChange={set("phone")} />
          </Field>
          <Field label="Email" htmlFor="np-email" hint="Needed for a parent portal account.">
            <input id="np-email" name="parent_email" type="email" inputMode="email" className="gf-input" autoComplete="off" value={who.email} onChange={set("email")} />
          </Field>
        </div>
      </fieldset>

      <div className="sticky bottom-0 z-10 -mx-4 flex flex-col gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:flex-row sm:items-center sm:rounded-xl sm:border">
        <SubmitButton pendingText="Adding…" className={buttonClasses({ size: "lg", className: "w-full sm:w-auto" })} disabled={numberCheck.state === "taken"}>
          Add pupil
        </SubmitButton>
        <span className="hidden text-xs text-slate-500 sm:inline">You can add a portal account and more details on the pupil&apos;s page afterwards.</span>
      </div>
    </form>
  );
}
