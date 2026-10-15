"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Copy, Link2, Loader2, Send } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClasses } from "@/components/ui/button";
import { Field, FormSection } from "@/components/ui/form-section";
import Link from "next/link";

type Application = {
  id: string;
  resume_token: string;
  status: string;
  section: "creche" | "primary" | "secondary" | null;
  parent_name: string | null;
  phone: string | null;
  email: string | null;
  desired_start: string | null;
  preferred_contact: string | null;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type ApplyWizardProps = {
  initialToken?: string;
};

type StepKey =
  | "overview"
  | "quick"
  | "student"
  | "parents"
  | "previous"
  | "review";

function asString(v: unknown) {
  return typeof v === "string" ? v : "";
}

function safeObject(v: unknown): Record<string, unknown> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  return v as Record<string, unknown>;
}

function mergeData(a: Record<string, unknown>, b: Record<string, unknown>) {
  return { ...a, ...b };
}

function SectionCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-canvas p-5">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-1.5 text-sm leading-relaxed text-slate-600">{description}</div>
    </div>
  );
}

function stepLabel(k: StepKey) {
  return k === "overview"
    ? "Overview"
    : k === "quick"
      ? "Quick"
      : k === "student"
        ? "Student"
        : k === "parents"
          ? "Parents"
          : k === "previous"
            ? "History"
            : "Review";
}

// Back on the left, primary action on the right; stacked (primary first) on phones.
const footerRow = "flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between";

export function ApplyWizard({ initialToken = "" }: ApplyWizardProps) {
  const [step, setStep] = useState<StepKey>("overview");
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState<boolean>(Boolean(initialToken));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const steps = useMemo(() => {
    return ["overview", "quick", "student", "parents", "previous", "review"] as StepKey[];
  }, []);

  const stepIndex = useMemo(() => {
    const idx = steps.indexOf(step);
    return idx < 0 ? 0 : idx;
  }, [step, steps]);

  const [quick, setQuick] = useState({
    parent_name: "",
    phone: "",
    email: "",
    section: "",
    desired_start: "",
    preferred_contact: "whatsapp",
    note: ""
  });

  const [student, setStudent] = useState({
    first_name: "",
    middle_name: "",
    last_name: "",
    sex: "",
    religion: "",
    dob: "",
    passport_photo_url: "",
    seeking_class: "",
    favorite_sports: "",
    hobbies: "",
    future_aspiration: "",
    child_with: ""
  });

  const [parents, setParents] = useState({
    parent1_name: "",
    parent1_phone: "",
    parent1_email: "",
    parent1_occupation: "",
    parent1_business_address: "",
    home_address: "",
    parent2_name: "",
    parent2_phone: "",
    parent2_email: "",
    parent2_occupation: "",
    parent2_business_address: "",
    preferred_contact_methods: ""
  });

  const [previous, setPrevious] = useState({
    has_been_in_school: "",
    previous_school_name: "",
    reason_for_leaving: "",
    qualification_testimonial: "",
    date_of_entry: "",
    date_of_exit: "",
    class_of_exit: "",
    discovery_source: "",
    referred: "",
    referrer_name: "",
    referrer_ref: "",
    other_child_in_school: "",
    other_child_names: "",
    pickup_details: "",
    student_signature_name: "",
    student_signature_date: "",
    parent_signature_name: "",
    parent_signature_date: ""
  });

  const resumeUrl = useMemo(() => {
    if (!token) return "";
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/apply?t=${token}`;
  }, [token]);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (!initialToken) return;
    if (loadedRef.current) return;
    loadedRef.current = true;

    setLoading(true);
    setError(null);

    fetch(`/api/apply/load?t=${encodeURIComponent(initialToken)}`)
      .then(async (res) => {
        const json = (await res.json()) as { ok: boolean; error?: string; application?: Application };
        if (!res.ok || !json.ok || !json.application) {
          throw new Error(json.error ?? "Could not load application.");
        }
        return json.application;
      })
      .then((app) => {
        setToken(app.resume_token);

        setQuick({
          parent_name: app.parent_name ?? "",
          phone: app.phone ?? "",
          email: app.email ?? "",
          section: app.section ?? "",
          desired_start: app.desired_start ?? "",
          preferred_contact: app.preferred_contact ?? "whatsapp",
          note: asString(safeObject(app.data).note)
        });

        const data = safeObject(app.data);

        setStudent({
          first_name: asString(data.first_name),
          middle_name: asString(data.middle_name),
          last_name: asString(data.last_name),
          sex: asString(data.sex),
          religion: asString(data.religion),
          dob: asString(data.dob),
          passport_photo_url: asString(data.passport_photo_url),
          seeking_class: asString(data.seeking_class),
          favorite_sports: asString(data.favorite_sports),
          hobbies: asString(data.hobbies),
          future_aspiration: asString(data.future_aspiration),
          child_with: asString(data.child_with)
        });

        setParents({
          parent1_name: asString(data.parent1_name),
          parent1_phone: asString(data.parent1_phone),
          parent1_email: asString(data.parent1_email),
          parent1_occupation: asString(data.parent1_occupation),
          parent1_business_address: asString(data.parent1_business_address),
          home_address: asString(data.home_address),
          parent2_name: asString(data.parent2_name),
          parent2_phone: asString(data.parent2_phone),
          parent2_email: asString(data.parent2_email),
          parent2_occupation: asString(data.parent2_occupation),
          parent2_business_address: asString(data.parent2_business_address),
          preferred_contact_methods: asString(data.preferred_contact_methods)
        });

        setPrevious({
          has_been_in_school: asString(data.has_been_in_school),
          previous_school_name: asString(data.previous_school_name),
          reason_for_leaving: asString(data.reason_for_leaving),
          qualification_testimonial: asString(data.qualification_testimonial),
          date_of_entry: asString(data.date_of_entry),
          date_of_exit: asString(data.date_of_exit),
          class_of_exit: asString(data.class_of_exit),
          discovery_source: asString(data.discovery_source),
          referred: asString(data.referred),
          referrer_name: asString(data.referrer_name),
          referrer_ref: asString(data.referrer_ref),
          other_child_in_school: asString(data.other_child_in_school),
          other_child_names: asString(data.other_child_names),
          pickup_details: asString(data.pickup_details),
          student_signature_name: asString(data.student_signature_name),
          student_signature_date: asString(data.student_signature_date),
          parent_signature_name: asString(data.parent_signature_name),
          parent_signature_date: asString(data.parent_signature_date)
        });
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load application.");
      })
      .finally(() => setLoading(false));
  }, [initialToken]);

  async function startApplication() {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/apply/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quick)
      });

      const json = (await res.json()) as { ok: boolean; error?: string; resumeToken?: string; id?: string };
      if (!res.ok || !json.ok || !json.resumeToken) {
        setError(json.error ?? "Could not start application.");
        return;
      }

      setToken(json.resumeToken);
      setSuccess("Application started. You can resume later using the link below.");
      setStep("student");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function savePatch(patch: Record<string, unknown>, extra?: Partial<typeof quick> & { status?: string }) {
    if (!token) {
      setError("Please start the application first.");
      return false;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    const payload: Record<string, unknown> = {
      token,
      patch
    };

    if (extra?.status) payload.status = extra.status;
    if (extra?.section) payload.section = extra.section;
    if (extra?.parent_name) payload.parent_name = extra.parent_name;
    if (extra?.phone) payload.phone = extra.phone;
    if (extra?.email) payload.email = extra.email;
    if (extra?.desired_start) payload.desired_start = extra.desired_start;
    if (extra?.preferred_contact) payload.preferred_contact = extra.preferred_contact;

    try {
      const res = await fetch("/api/apply/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !json?.ok) {
        setError(json?.error ?? "We could not save your progress.");
        return false;
      }

      setSuccess("Saved.");
      return true;
    } catch {
      setError("Network error. Please try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  const canContinueQuick = quick.parent_name.trim().length >= 2 && quick.phone.trim().length >= 7;

  async function saveStudentAndNext() {
    const legacySurname = student.last_name;
    const legacyOtherNames = `${student.first_name} ${student.middle_name}`.trim();
    const ok = await savePatch(
      {
        first_name: student.first_name,
        middle_name: student.middle_name,
        last_name: student.last_name,
        passport_photo_url: student.passport_photo_url,
        favorite_sports: student.favorite_sports,
        surname: legacySurname,
        other_names: legacyOtherNames,
        sex: student.sex,
        religion: student.religion,
        dob: student.dob,
        seeking_class: student.seeking_class,
        hobbies: student.hobbies,
        future_aspiration: student.future_aspiration,
        child_with: student.child_with
      },
      {
        section: quick.section,
        parent_name: quick.parent_name,
        phone: quick.phone,
        email: quick.email,
        desired_start: quick.desired_start,
        preferred_contact: quick.preferred_contact
      }
    );

    if (ok) setStep("parents");
  }

  async function saveParentsAndNext() {
    const ok = await savePatch({
      parent1_name: parents.parent1_name,
      parent1_phone: parents.parent1_phone,
      parent1_email: parents.parent1_email,
      parent1_occupation: parents.parent1_occupation,
      parent1_business_address: parents.parent1_business_address,
      home_address: parents.home_address,
      parent2_name: parents.parent2_name,
      parent2_phone: parents.parent2_phone,
      parent2_email: parents.parent2_email,
      parent2_occupation: parents.parent2_occupation,
      parent2_business_address: parents.parent2_business_address,
      preferred_contact_methods: parents.preferred_contact_methods
    });

    if (ok) setStep("previous");
  }

  async function savePreviousAndNext() {
    const ok = await savePatch({
      has_been_in_school: previous.has_been_in_school,
      previous_school_name: previous.previous_school_name,
      reason_for_leaving: previous.reason_for_leaving,
      qualification_testimonial: previous.qualification_testimonial,
      date_of_entry: previous.date_of_entry,
      date_of_exit: previous.date_of_exit,
      class_of_exit: previous.class_of_exit,
      discovery_source: previous.discovery_source,
      referred: previous.referred,
      referrer_name: previous.referrer_name,
      referrer_ref: previous.referrer_ref,
      other_child_in_school: previous.other_child_in_school,
      other_child_names: previous.other_child_names,
      pickup_details: previous.pickup_details,
      student_signature_name: previous.student_signature_name,
      student_signature_date: previous.student_signature_date,
      parent_signature_name: previous.parent_signature_name,
      parent_signature_date: previous.parent_signature_date
    });

    if (ok) setStep("review");
  }

  async function submitApplication() {
    const payload = mergeData(
      {
        note: quick.note
      },
      mergeData(
        {
          first_name: student.first_name,
          middle_name: student.middle_name,
          last_name: student.last_name,
          passport_photo_url: student.passport_photo_url,
          favorite_sports: student.favorite_sports,
          surname: student.last_name,
          other_names: `${student.first_name} ${student.middle_name}`.trim(),
          sex: student.sex,
          religion: student.religion,
          dob: student.dob,
          seeking_class: student.seeking_class,
          hobbies: student.hobbies,
          future_aspiration: student.future_aspiration,
          child_with: student.child_with
        },
        mergeData(
          {
            parent1_name: parents.parent1_name,
            parent1_phone: parents.parent1_phone,
            parent1_email: parents.parent1_email,
            parent1_occupation: parents.parent1_occupation,
            parent1_business_address: parents.parent1_business_address,
            home_address: parents.home_address,
            parent2_name: parents.parent2_name,
            parent2_phone: parents.parent2_phone,
            parent2_email: parents.parent2_email,
            parent2_occupation: parents.parent2_occupation,
            parent2_business_address: parents.parent2_business_address,
            preferred_contact_methods: parents.preferred_contact_methods
          },
          {
            has_been_in_school: previous.has_been_in_school,
            previous_school_name: previous.previous_school_name,
            reason_for_leaving: previous.reason_for_leaving,
            qualification_testimonial: previous.qualification_testimonial,
            date_of_entry: previous.date_of_entry,
            date_of_exit: previous.date_of_exit,
            class_of_exit: previous.class_of_exit,
            discovery_source: previous.discovery_source,
            referred: previous.referred,
            referrer_name: previous.referrer_name,
            referrer_ref: previous.referrer_ref,
            other_child_in_school: previous.other_child_in_school,
            other_child_names: previous.other_child_names,
            pickup_details: previous.pickup_details,
            student_signature_name: previous.student_signature_name,
            student_signature_date: previous.student_signature_date,
            parent_signature_name: previous.parent_signature_name,
            parent_signature_date: previous.parent_signature_date
          }
        )
      )
    );

    const ok = await savePatch(payload, {
      status: "submitted",
      section: quick.section,
      parent_name: quick.parent_name,
      phone: quick.phone,
      email: quick.email,
      desired_start: quick.desired_start,
      preferred_contact: quick.preferred_contact
    });

    if (ok) {
      setSuccess("Submitted. Our admissions team will contact you shortly.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-gold-700">Admissions application</div>
            <div className="mt-1 font-display text-xl font-semibold text-slate-900">{stepLabel(step)}</div>
          </div>
          <div className="shrink-0 rounded-full bg-brand-green-50 px-3 py-1 text-xs font-semibold text-brand-green-700">
            Step {stepIndex + 1} of {steps.length}
          </div>
        </div>

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-brand-green transition-all"
            style={{ width: `${Math.round(((stepIndex + 1) / steps.length) * 100)}%` }}
          />
        </div>

        <ol className="-mx-1 mt-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-1 pb-1 [-webkit-overflow-scrolling:touch] md:grid md:grid-cols-6 md:overflow-visible">
          {steps.map((k, i) => {
            const active = k === step;
            const done = i < stepIndex;
            const label = stepLabel(k);

            return (
              <li key={k} className="snap-start">
                <button
                  type="button"
                  aria-current={active ? "step" : undefined}
                  className={
                    "flex w-full items-center gap-2 whitespace-nowrap rounded-xl px-3 py-2 text-left text-xs font-semibold transition disabled:cursor-not-allowed " +
                    (active
                      ? "bg-brand-green text-white shadow-sm"
                      : done
                        ? "bg-brand-green-50 text-brand-green-800 hover:bg-brand-green-100"
                        : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                  }
                  onClick={() => setStep(k)}
                  disabled={saving}
                >
                  <span
                    className={
                      "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] " +
                      (active ? "bg-brand-gold text-brand-green-950" : done ? "bg-brand-green text-white" : "bg-slate-100 text-slate-500")
                    }
                  >
                    {done ? <Check className="h-3 w-3" aria-hidden="true" /> : i + 1}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Loading…
        </div>
      ) : null}

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {success ? <Alert tone="success">{success}</Alert> : null}

      {token ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-brand-gold-200 bg-brand-gold-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <Link2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-brand-gold-700" aria-hidden="true" />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900">Resume later</div>
              <div className="mt-0.5 break-all text-sm text-slate-700">{resumeUrl}</div>
            </div>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={async () => {
              if (!resumeUrl) return;
              await navigator.clipboard.writeText(resumeUrl);
              setSuccess("Resume link copied.");
            }}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            Copy link
          </Button>
        </div>
      ) : null}

      {step === "overview" ? (
        <FormSection
          title="Before you start"
          description="This application is in sections. Start with quick details so we can reach you quickly, then complete the full application."
          footer={
            <div className={footerRow}>
              <a href="/admissions" className={buttonClasses({ variant: "secondary", size: "lg", className: "w-full sm:w-auto" })}>
                Back to admissions info
              </a>
              <Button type="button" size="lg" className="w-full sm:w-auto" onClick={() => setStep("quick")}>
                Start
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard title="1) Quick details (under a minute)" description="Parent contact + section + preferred communication." />
            <SectionCard title="2) Student details" description="Name, age/DOB, class seeking, interests." />
            <SectionCard title="3) Parent/guardian details" description="Addresses and key contact details." />
            <SectionCard title="4) Previous school" description="Only if the child has been in school before." />
            <SectionCard title="5) Review & submit" description="Confirm details and submit to admissions." />
          </div>
        </FormSection>
      ) : null}

      {step === "quick" ? (
        <FormSection
          title="Quick details"
          description="We’ll use this to contact you and guide the next steps."
          footer={
            <div className={footerRow}>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setStep("overview")}
                disabled={saving}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              {!token ? (
                <Button
                  type="button"
                  size="lg"
                  disabled={!canContinueQuick || saving}
                  className="w-full sm:w-auto"
                  onClick={startApplication}
                >
                  {saving ? "Starting…" : "Continue"}
                  {!saving ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  disabled={!canContinueQuick || saving}
                  className="w-full sm:w-auto"
                  onClick={async () => {
                    const ok = await savePatch(
                      { note: quick.note },
                      {
                        section: quick.section,
                        parent_name: quick.parent_name,
                        phone: quick.phone,
                        email: quick.email,
                        desired_start: quick.desired_start,
                        preferred_contact: quick.preferred_contact
                      }
                    );
                    if (ok) setStep("student");
                  }}
                >
                  {saving ? "Saving…" : "Continue"}
                  {!saving ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
                </Button>
              )}
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Parent/guardian name" htmlFor="apply-parent-name">
              <input
                id="apply-parent-name"
                className="gf-input"
                value={quick.parent_name}
                onChange={(e) => setQuick((s) => ({ ...s, parent_name: e.target.value }))}
                placeholder="Full name"
                autoComplete="name"
              />
            </Field>
            <Field label="Phone number" htmlFor="apply-phone">
              <input
                id="apply-phone"
                className="gf-input"
                value={quick.phone}
                onChange={(e) => setQuick((s) => ({ ...s, phone: e.target.value }))}
                placeholder="e.g. 090..."
                autoComplete="tel"
              />
            </Field>
            <Field label="Email (optional)" htmlFor="apply-email">
              <input
                id="apply-email"
                className="gf-input"
                value={quick.email}
                onChange={(e) => setQuick((s) => ({ ...s, email: e.target.value }))}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Section" htmlFor="apply-section">
              <select
                id="apply-section"
                className="gf-select"
                value={quick.section}
                onChange={(e) => setQuick((s) => ({ ...s, section: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="creche">Creche (0–4)</option>
                <option value="primary">Primary (5–11)</option>
                <option value="secondary">Secondary (12–16)</option>
              </select>
            </Field>
            <Field label="Desired start" htmlFor="apply-desired-start">
              <select
                id="apply-desired-start"
                className="gf-select"
                value={quick.desired_start}
                onChange={(e) => setQuick((s) => ({ ...s, desired_start: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="this_term">This term</option>
                <option value="next_term">Next term</option>
                <option value="next_session">Next session</option>
                <option value="not_sure">Not sure</option>
              </select>
            </Field>
            <Field label="Preferred contact" htmlFor="apply-preferred-contact">
              <select
                id="apply-preferred-contact"
                className="gf-select"
                value={quick.preferred_contact}
                onChange={(e) => setQuick((s) => ({ ...s, preferred_contact: e.target.value }))}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
              </select>
            </Field>
            <Field label="What would you like help with? (optional)" htmlFor="apply-note" className="sm:col-span-2">
              <textarea
                id="apply-note"
                className="gf-input min-h-[96px]"
                value={quick.note}
                onChange={(e) => setQuick((s) => ({ ...s, note: e.target.value }))}
                placeholder="e.g. fees, entry class, school bus, visit request"
              />
            </Field>
          </div>
        </FormSection>
      ) : null}

      {step === "student" ? (
        <FormSection
          title="Student details"
          footer={
            <div className={footerRow}>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setStep("quick")}
                disabled={saving}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              <Button type="button" size="lg" className="w-full sm:w-auto" disabled={saving} onClick={saveStudentAndNext}>
                {saving ? "Saving…" : "Continue"}
                {!saving ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Last name (surname)" htmlFor="apply-last-name">
              <input
                id="apply-last-name"
                className="gf-input"
                value={student.last_name}
                onChange={(e) => setStudent((s) => ({ ...s, last_name: e.target.value }))}
              />
            </Field>
            <Field label="First name" htmlFor="apply-first-name">
              <input
                id="apply-first-name"
                className="gf-input"
                value={student.first_name}
                onChange={(e) => setStudent((s) => ({ ...s, first_name: e.target.value }))}
              />
            </Field>
            <Field label="Middle name (optional)" htmlFor="apply-middle-name" className="sm:col-span-2">
              <input
                id="apply-middle-name"
                className="gf-input"
                value={student.middle_name}
                onChange={(e) => setStudent((s) => ({ ...s, middle_name: e.target.value }))}
              />
            </Field>
            <Field label="Date of birth (optional)" htmlFor="apply-dob">
              <input
                id="apply-dob"
                type="date"
                className="gf-input"
                value={student.dob}
                onChange={(e) => setStudent((s) => ({ ...s, dob: e.target.value }))}
              />
            </Field>
            <Field label="Sex" htmlFor="apply-sex">
              <select
                id="apply-sex"
                className="gf-select"
                value={student.sex}
                onChange={(e) => setStudent((s) => ({ ...s, sex: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </Field>
            <Field label="Religion (optional)" htmlFor="apply-religion">
              <input
                id="apply-religion"
                className="gf-input"
                value={student.religion}
                onChange={(e) => setStudent((s) => ({ ...s, religion: e.target.value }))}
              />
            </Field>
            <Field label="Seeking admission into" htmlFor="apply-seeking-class">
              <input
                id="apply-seeking-class"
                className="gf-input"
                value={student.seeking_class}
                onChange={(e) => setStudent((s) => ({ ...s, seeking_class: e.target.value }))}
                placeholder="e.g. Nursery 2, Primary 1, JSS1"
              />
            </Field>
            <Field label="Student passport photo URL (optional)" htmlFor="apply-passport-photo">
              <input
                id="apply-passport-photo"
                className="gf-input"
                value={student.passport_photo_url}
                onChange={(e) => setStudent((s) => ({ ...s, passport_photo_url: e.target.value }))}
                placeholder="https://..."
              />
            </Field>
            <Field label="Favorite sports (optional)" htmlFor="apply-favorite-sports">
              <input
                id="apply-favorite-sports"
                className="gf-input"
                value={student.favorite_sports}
                onChange={(e) => setStudent((s) => ({ ...s, favorite_sports: e.target.value }))}
                placeholder="e.g. Football, Swimming"
              />
            </Field>
            <Field label="Hobbies (optional)" htmlFor="apply-hobbies" className="sm:col-span-2">
              <input
                id="apply-hobbies"
                className="gf-input"
                value={student.hobbies}
                onChange={(e) => setStudent((s) => ({ ...s, hobbies: e.target.value }))}
              />
            </Field>
            <Field label="Future aspiration (optional)" htmlFor="apply-future-aspiration" className="sm:col-span-2">
              <input
                id="apply-future-aspiration"
                className="gf-input"
                value={student.future_aspiration}
                onChange={(e) => setStudent((s) => ({ ...s, future_aspiration: e.target.value }))}
              />
            </Field>
            <Field label="Child is with (optional)" htmlFor="apply-child-with" className="sm:col-span-2">
              <select
                id="apply-child-with"
                className="gf-select"
                value={student.child_with}
                onChange={(e) => setStudent((s) => ({ ...s, child_with: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="both_parents">Both parents</option>
                <option value="father">Father</option>
                <option value="mother">Mother</option>
                <option value="guardian">Guardian</option>
              </select>
            </Field>
          </div>
        </FormSection>
      ) : null}

      {step === "parents" ? (
        <FormSection
          title="Parent/guardian details"
          footer={
            <div className={footerRow}>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setStep("student")}
                disabled={saving}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              <Button type="button" size="lg" className="w-full sm:w-auto" disabled={saving} onClick={saveParentsAndNext}>
                {saving ? "Saving…" : "Continue"}
                {!saving ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First parent/guardian name" htmlFor="apply-parent1-name">
              <input
                id="apply-parent1-name"
                className="gf-input"
                value={parents.parent1_name}
                onChange={(e) => setParents((s) => ({ ...s, parent1_name: e.target.value }))}
              />
            </Field>
            <Field label="Phone" htmlFor="apply-parent1-phone">
              <input
                id="apply-parent1-phone"
                className="gf-input"
                value={parents.parent1_phone}
                onChange={(e) => setParents((s) => ({ ...s, parent1_phone: e.target.value }))}
              />
            </Field>
            <Field label="Email (optional)" htmlFor="apply-parent1-email">
              <input
                id="apply-parent1-email"
                className="gf-input"
                value={parents.parent1_email}
                onChange={(e) => setParents((s) => ({ ...s, parent1_email: e.target.value }))}
              />
            </Field>
            <Field label="Occupation (optional)" htmlFor="apply-parent1-occupation">
              <input
                id="apply-parent1-occupation"
                className="gf-input"
                value={parents.parent1_occupation}
                onChange={(e) => setParents((s) => ({ ...s, parent1_occupation: e.target.value }))}
              />
            </Field>
            <Field label="Business address (optional)" htmlFor="apply-parent1-business-address" className="sm:col-span-2">
              <input
                id="apply-parent1-business-address"
                className="gf-input"
                value={parents.parent1_business_address}
                onChange={(e) => setParents((s) => ({ ...s, parent1_business_address: e.target.value }))}
              />
            </Field>
            <Field label="Home address (optional)" htmlFor="apply-home-address" className="sm:col-span-2">
              <input
                id="apply-home-address"
                className="gf-input"
                value={parents.home_address}
                onChange={(e) => setParents((s) => ({ ...s, home_address: e.target.value }))}
              />
            </Field>

            <div className="mt-2 border-t border-slate-100 pt-5 sm:col-span-2">
              <div className="text-sm font-semibold text-slate-900">Second parent (optional)</div>
            </div>

            <Field label="Second parent name" htmlFor="apply-parent2-name">
              <input
                id="apply-parent2-name"
                className="gf-input"
                value={parents.parent2_name}
                onChange={(e) => setParents((s) => ({ ...s, parent2_name: e.target.value }))}
              />
            </Field>
            <Field label="Phone" htmlFor="apply-parent2-phone">
              <input
                id="apply-parent2-phone"
                className="gf-input"
                value={parents.parent2_phone}
                onChange={(e) => setParents((s) => ({ ...s, parent2_phone: e.target.value }))}
              />
            </Field>
            <Field label="Email" htmlFor="apply-parent2-email">
              <input
                id="apply-parent2-email"
                className="gf-input"
                value={parents.parent2_email}
                onChange={(e) => setParents((s) => ({ ...s, parent2_email: e.target.value }))}
              />
            </Field>
            <Field label="Occupation" htmlFor="apply-parent2-occupation">
              <input
                id="apply-parent2-occupation"
                className="gf-input"
                value={parents.parent2_occupation}
                onChange={(e) => setParents((s) => ({ ...s, parent2_occupation: e.target.value }))}
              />
            </Field>
            <Field label="Business address (optional)" htmlFor="apply-parent2-business-address" className="sm:col-span-2">
              <input
                id="apply-parent2-business-address"
                className="gf-input"
                value={parents.parent2_business_address}
                onChange={(e) => setParents((s) => ({ ...s, parent2_business_address: e.target.value }))}
              />
            </Field>
            <Field
              label="Best means of communication (comma separated)"
              htmlFor="apply-preferred-contact-methods"
              className="sm:col-span-2"
            >
              <input
                id="apply-preferred-contact-methods"
                className="gf-input"
                value={parents.preferred_contact_methods}
                onChange={(e) => setParents((s) => ({ ...s, preferred_contact_methods: e.target.value }))}
                placeholder="e.g. text, email, call, telegram, whatsapp"
              />
            </Field>
          </div>
        </FormSection>
      ) : null}

      {step === "previous" ? (
        <FormSection
          title="Previous school"
          footer={
            <div className={footerRow}>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setStep("parents")}
                disabled={saving}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              <Button type="button" size="lg" className="w-full sm:w-auto" disabled={saving} onClick={savePreviousAndNext}>
                {saving ? "Saving…" : "Continue"}
                {!saving ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Has your child been in school?" htmlFor="apply-has-been-in-school">
              <select
                id="apply-has-been-in-school"
                className="gf-select"
                value={previous.has_been_in_school}
                onChange={(e) => setPrevious((s) => ({ ...s, has_been_in_school: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>

            {previous.has_been_in_school === "yes" ? (
              <>
                <Field label="Name of school" htmlFor="apply-previous-school-name">
                  <input
                    id="apply-previous-school-name"
                    className="gf-input"
                    value={previous.previous_school_name}
                    onChange={(e) => setPrevious((s) => ({ ...s, previous_school_name: e.target.value }))}
                  />
                </Field>
                <Field label="Reason for leaving" htmlFor="apply-reason-for-leaving">
                  <input
                    id="apply-reason-for-leaving"
                    className="gf-input"
                    value={previous.reason_for_leaving}
                    onChange={(e) => setPrevious((s) => ({ ...s, reason_for_leaving: e.target.value }))}
                    placeholder="e.g. relocation"
                  />
                </Field>
                <Field label="Date of entry (optional)" htmlFor="apply-date-of-entry">
                  <input
                    id="apply-date-of-entry"
                    type="date"
                    className="gf-input"
                    value={previous.date_of_entry}
                    onChange={(e) => setPrevious((s) => ({ ...s, date_of_entry: e.target.value }))}
                  />
                </Field>
                <Field label="Date of exit (optional)" htmlFor="apply-date-of-exit">
                  <input
                    id="apply-date-of-exit"
                    type="date"
                    className="gf-input"
                    value={previous.date_of_exit}
                    onChange={(e) => setPrevious((s) => ({ ...s, date_of_exit: e.target.value }))}
                  />
                </Field>
                <Field label="Class of exit (optional)" htmlFor="apply-class-of-exit">
                  <input
                    id="apply-class-of-exit"
                    className="gf-input"
                    value={previous.class_of_exit}
                    onChange={(e) => setPrevious((s) => ({ ...s, class_of_exit: e.target.value }))}
                  />
                </Field>
                <Field label="Qualification/testimonial (optional)" htmlFor="apply-qualification-testimonial">
                  <input
                    id="apply-qualification-testimonial"
                    className="gf-input"
                    value={previous.qualification_testimonial}
                    onChange={(e) => setPrevious((s) => ({ ...s, qualification_testimonial: e.target.value }))}
                  />
                </Field>
              </>
            ) : null}

            <Field label="How did you discover Greenfield?" htmlFor="apply-discovery-source">
              <select
                id="apply-discovery-source"
                className="gf-select"
                value={previous.discovery_source}
                onChange={(e) => setPrevious((s) => ({ ...s, discovery_source: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="passing_by">Passing by</option>
                <option value="friend">Friend</option>
                <option value="staff">Staff</option>
                <option value="communication_media">Communication media</option>
              </select>
            </Field>

            <Field label="Were you referred?" htmlFor="apply-referred">
              <select
                id="apply-referred"
                className="gf-select"
                value={previous.referred}
                onChange={(e) => setPrevious((s) => ({ ...s, referred: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>

            <Field label="Referrer name (optional)" htmlFor="apply-referrer-name">
              <input
                id="apply-referrer-name"
                className="gf-input"
                value={previous.referrer_name}
                onChange={(e) => setPrevious((s) => ({ ...s, referrer_name: e.target.value }))}
              />
            </Field>

            <Field label="Referrer number (optional)" htmlFor="apply-referrer-ref">
              <input
                id="apply-referrer-ref"
                className="gf-input"
                value={previous.referrer_ref}
                onChange={(e) => setPrevious((s) => ({ ...s, referrer_ref: e.target.value }))}
              />
            </Field>

            <Field label="Any other child in Greenfield?" htmlFor="apply-other-child">
              <select
                id="apply-other-child"
                className="gf-select"
                value={previous.other_child_in_school}
                onChange={(e) => setPrevious((s) => ({ ...s, other_child_in_school: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>

            <Field label="Other child name(s) (optional)" htmlFor="apply-other-child-names">
              <input
                id="apply-other-child-names"
                className="gf-input"
                value={previous.other_child_names}
                onChange={(e) => setPrevious((s) => ({ ...s, other_child_names: e.target.value }))}
              />
            </Field>

            <Field label="Pickup details (who picks up the child)" htmlFor="apply-pickup-details" className="sm:col-span-2">
              <textarea
                id="apply-pickup-details"
                className="gf-input min-h-[96px]"
                value={previous.pickup_details}
                onChange={(e) => setPrevious((s) => ({ ...s, pickup_details: e.target.value }))}
              />
            </Field>

            <div className="mt-2 border-t border-slate-100 pt-5 sm:col-span-2">
              <div className="text-sm font-semibold text-slate-900">Signatures</div>
            </div>

            <Field label="Student signature (type name)" htmlFor="apply-student-signature-name">
              <input
                id="apply-student-signature-name"
                className="gf-input"
                value={previous.student_signature_name}
                onChange={(e) => setPrevious((s) => ({ ...s, student_signature_name: e.target.value }))}
              />
            </Field>

            <Field label="Student signature date" htmlFor="apply-student-signature-date">
              <input
                id="apply-student-signature-date"
                type="date"
                className="gf-input"
                value={previous.student_signature_date}
                onChange={(e) => setPrevious((s) => ({ ...s, student_signature_date: e.target.value }))}
              />
            </Field>

            <Field label="Parent signature (type name)" htmlFor="apply-parent-signature-name">
              <input
                id="apply-parent-signature-name"
                className="gf-input"
                value={previous.parent_signature_name}
                onChange={(e) => setPrevious((s) => ({ ...s, parent_signature_name: e.target.value }))}
              />
            </Field>

            <Field label="Parent signature date" htmlFor="apply-parent-signature-date">
              <input
                id="apply-parent-signature-date"
                type="date"
                className="gf-input"
                value={previous.parent_signature_date}
                onChange={(e) => setPrevious((s) => ({ ...s, parent_signature_date: e.target.value }))}
              />
            </Field>
          </div>
        </FormSection>
      ) : null}

      {step === "review" ? (
        <FormSection
          title="Review & submit"
          description={
            <>
              Confirm your details. You can also copy the resume link above and continue later. By submitting, you
              confirm the information is correct and, as the child&apos;s parent or guardian, consent to Greenfield
              School processing it for admissions as described in our{" "}
              <Link href="/privacy" className="font-medium text-brand-green underline underline-offset-2">
                privacy policy
              </Link>
              .
            </>
          }
          footer={
            <div className={footerRow}>
              <Button
                type="button"
                variant="secondary"
                size="lg"
                className="w-full sm:w-auto"
                onClick={() => setStep("previous")}
                disabled={saving}
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </Button>
              <Button type="button" variant="gold" size="lg" className="w-full sm:w-auto" disabled={saving} onClick={submitApplication}>
                {saving ? "Submitting…" : "Submit application"}
                {!saving ? <Send className="h-4 w-4" aria-hidden="true" /> : null}
              </Button>
            </div>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <SectionCard
              title="Quick details"
              description={`${quick.parent_name || "—"} • ${quick.phone || "—"} • ${quick.section || "—"}`}
            />
            <SectionCard
              title="Student"
              description={`${student.last_name || ""} ${student.first_name || ""} ${student.middle_name || ""} • ${student.seeking_class || "—"}`}
            />
            <SectionCard
              title="Parent/guardian"
              description={`${parents.parent1_name || "—"} • ${parents.parent1_phone || "—"}`}
            />
            <SectionCard
              title="Previous school"
              description={
                previous.has_been_in_school === "yes"
                  ? `${previous.previous_school_name || "—"} • ${previous.reason_for_leaving || ""}`
                  : previous.has_been_in_school === "no"
                    ? "No"
                    : "—"
              }
            />
          </div>

          {token ? (
            <Alert tone="info" title="What happens next" className="mt-5">
              Our admissions team will review your application and contact you via your preferred method.
            </Alert>
          ) : null}
        </FormSection>
      ) : null}

      <div className="min-h-[1rem] text-xs text-slate-500" aria-live="polite">
        {saving ? "Saving…" : ""}
      </div>
    </div>
  );
}
