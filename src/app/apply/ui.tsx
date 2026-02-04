"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm text-slate-600">{description}</div>
    </div>
  );
}

export function ApplyWizard({ initialToken = "" }: ApplyWizardProps) {
  const [step, setStep] = useState<StepKey>("overview");
  const [token, setToken] = useState(initialToken);
  const [loading, setLoading] = useState<boolean>(Boolean(initialToken));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
    surname: "",
    other_names: "",
    sex: "",
    religion: "",
    dob: "",
    seeking_class: "",
    hobbies: "",
    future_aspiration: "",
    child_with: ""
  });

  const [parents, setParents] = useState({
    parent1_name: "",
    parent1_phone: "",
    parent1_email: "",
    parent1_occupation: "",
    home_address: "",
    parent2_name: "",
    parent2_phone: "",
    parent2_email: "",
    parent2_occupation: ""
  });

  const [previous, setPrevious] = useState({
    has_been_in_school: "",
    previous_school_name: "",
    reason_for_leaving: "",
    qualification_testimonial: "",
    date_of_entry: "",
    date_of_exit: "",
    class_of_exit: ""
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
          surname: asString(data.surname),
          other_names: asString(data.other_names),
          sex: asString(data.sex),
          religion: asString(data.religion),
          dob: asString(data.dob),
          seeking_class: asString(data.seeking_class),
          hobbies: asString(data.hobbies),
          future_aspiration: asString(data.future_aspiration),
          child_with: asString(data.child_with)
        });

        setParents({
          parent1_name: asString(data.parent1_name),
          parent1_phone: asString(data.parent1_phone),
          parent1_email: asString(data.parent1_email),
          parent1_occupation: asString(data.parent1_occupation),
          home_address: asString(data.home_address),
          parent2_name: asString(data.parent2_name),
          parent2_phone: asString(data.parent2_phone),
          parent2_email: asString(data.parent2_email),
          parent2_occupation: asString(data.parent2_occupation)
        });

        setPrevious({
          has_been_in_school: asString(data.has_been_in_school),
          previous_school_name: asString(data.previous_school_name),
          reason_for_leaving: asString(data.reason_for_leaving),
          qualification_testimonial: asString(data.qualification_testimonial),
          date_of_entry: asString(data.date_of_entry),
          date_of_exit: asString(data.date_of_exit),
          class_of_exit: asString(data.class_of_exit)
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
    const ok = await savePatch(
      {
        surname: student.surname,
        other_names: student.other_names,
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
      home_address: parents.home_address,
      parent2_name: parents.parent2_name,
      parent2_phone: parents.parent2_phone,
      parent2_email: parents.parent2_email,
      parent2_occupation: parents.parent2_occupation
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
      class_of_exit: previous.class_of_exit
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
          surname: student.surname,
          other_names: student.other_names,
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
            home_address: parents.home_address,
            parent2_name: parents.parent2_name,
            parent2_phone: parents.parent2_phone,
            parent2_email: parents.parent2_email,
            parent2_occupation: parents.parent2_occupation
          },
          {
            has_been_in_school: previous.has_been_in_school,
            previous_school_name: previous.previous_school_name,
            reason_for_leaving: previous.reason_for_leaving,
            qualification_testimonial: previous.qualification_testimonial,
            date_of_entry: previous.date_of_entry,
            date_of_exit: previous.date_of_exit,
            class_of_exit: previous.class_of_exit
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
    <div className="rounded-3xl border border-slate-200 bg-white p-6 sm:p-8">
      {loading ? <div className="text-sm text-slate-600">Loading…</div> : null}

      {error ? (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {success}
        </div>
      ) : null}

      {token ? (
        <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-900">Resume later</div>
          <div className="mt-2 text-sm text-slate-700 break-all">{resumeUrl}</div>
          <button
            type="button"
            className="mt-3 inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            onClick={async () => {
              if (!resumeUrl) return;
              await navigator.clipboard.writeText(resumeUrl);
              setSuccess("Resume link copied.");
            }}
          >
            Copy link
          </button>
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900">Admissions Application</div>
        <div className="text-xs text-slate-500">Autosave: on step completion</div>
      </div>

      <div className="mt-3 grid grid-cols-6 gap-2">
        {(["overview", "quick", "student", "parents", "previous", "review"] as StepKey[]).map((k) => {
          const active = k === step;
          return (
            <button
              key={k}
              type="button"
              className={
                "rounded-lg px-2 py-2 text-xs font-semibold transition " +
                (active
                  ? "bg-brand-green text-white"
                  : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
              }
              onClick={() => setStep(k)}
              disabled={saving}
            >
              {k === "overview"
                ? "Overview"
                : k === "quick"
                  ? "Quick"
                  : k === "student"
                    ? "Student"
                    : k === "parents"
                      ? "Parents"
                      : k === "previous"
                        ? "History"
                        : "Review"}
            </button>
          );
        })}
      </div>

      {step === "overview" ? (
        <div className="mt-6">
          <div className="text-sm text-slate-600">
            This application is in sections. Start with quick details so we can reach you quickly, then
            complete the full application.
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <SectionCard title="1) Quick details (under a minute)" description="Parent contact + section + preferred communication." />
            <SectionCard title="2) Student details" description="Name, age/DOB, class seeking, interests." />
            <SectionCard title="3) Parent/guardian details" description="Addresses and key contact details." />
            <SectionCard title="4) Previous school" description="Only if the child has been in school before." />
            <SectionCard title="5) Review & submit" description="Confirm details and submit to admissions." />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95"
              onClick={() => setStep("quick")}
            >
              Start
            </button>
            <a
              href="/admissions"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
            >
              Back to admissions info
            </a>
          </div>
        </div>
      ) : null}

      {step === "quick" ? (
        <div className="mt-6">
          <div className="text-sm font-semibold text-slate-900">Quick details</div>
          <div className="mt-1 text-sm text-slate-600">We’ll use this to contact you and guide the next steps.</div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-900">Parent/Guardian name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={quick.parent_name}
                onChange={(e) => setQuick((s) => ({ ...s, parent_name: e.target.value }))}
                placeholder="Full name"
                autoComplete="name"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Phone number</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={quick.phone}
                onChange={(e) => setQuick((s) => ({ ...s, phone: e.target.value }))}
                placeholder="e.g. 090..."
                autoComplete="tel"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Email (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={quick.email}
                onChange={(e) => setQuick((s) => ({ ...s, email: e.target.value }))}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Section</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={quick.section}
                onChange={(e) => setQuick((s) => ({ ...s, section: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="creche">Creche (0–4)</option>
                <option value="primary">Primary (5–11)</option>
                <option value="secondary">Secondary (12–16)</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Desired start</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={quick.desired_start}
                onChange={(e) => setQuick((s) => ({ ...s, desired_start: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="this_term">This term</option>
                <option value="next_term">Next term</option>
                <option value="next_session">Next session</option>
                <option value="not_sure">Not sure</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Preferred contact</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={quick.preferred_contact}
                onChange={(e) => setQuick((s) => ({ ...s, preferred_contact: e.target.value }))}
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-900">What would you like help with? (optional)</label>
              <textarea
                className="mt-1 min-h-[90px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={quick.note}
                onChange={(e) => setQuick((s) => ({ ...s, note: e.target.value }))}
                placeholder="e.g. fees, entry class, school bus, visit request"
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {!token ? (
              <button
                type="button"
                disabled={!canContinueQuick || saving}
                className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={startApplication}
              >
                {saving ? "Starting…" : "Continue"}
              </button>
            ) : (
              <button
                type="button"
                disabled={!canContinueQuick || saving}
                className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
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
              </button>
            )}

            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              onClick={() => setStep("overview")}
              disabled={saving}
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      {step === "student" ? (
        <div className="mt-6">
          <div className="text-sm font-semibold text-slate-900">Student details</div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-900">Surname</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={student.surname}
                onChange={(e) => setStudent((s) => ({ ...s, surname: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Other names</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={student.other_names}
                onChange={(e) => setStudent((s) => ({ ...s, other_names: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Date of birth (optional)</label>
              <input
                type="date"
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={student.dob}
                onChange={(e) => setStudent((s) => ({ ...s, dob: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Sex</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={student.sex}
                onChange={(e) => setStudent((s) => ({ ...s, sex: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Religion (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={student.religion}
                onChange={(e) => setStudent((s) => ({ ...s, religion: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Seeking admission into</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={student.seeking_class}
                onChange={(e) => setStudent((s) => ({ ...s, seeking_class: e.target.value }))}
                placeholder="e.g. Nursery 2, Primary 1, JSS1"
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-900">Hobbies (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={student.hobbies}
                onChange={(e) => setStudent((s) => ({ ...s, hobbies: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-900">Future aspiration (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={student.future_aspiration}
                onChange={(e) => setStudent((s) => ({ ...s, future_aspiration: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-900">Child is with (optional)</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={student.child_with}
                onChange={(e) => setStudent((s) => ({ ...s, child_with: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="both_parents">Both parents</option>
                <option value="father">Father</option>
                <option value="mother">Mother</option>
                <option value="guardian">Guardian</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={saveStudentAndNext}
            >
              {saving ? "Saving…" : "Continue"}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              onClick={() => setStep("quick")}
              disabled={saving}
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      {step === "parents" ? (
        <div className="mt-6">
          <div className="text-sm font-semibold text-slate-900">Parent/guardian details</div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-900">First parent/guardian name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={parents.parent1_name}
                onChange={(e) => setParents((s) => ({ ...s, parent1_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Phone</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={parents.parent1_phone}
                onChange={(e) => setParents((s) => ({ ...s, parent1_phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Email (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={parents.parent1_email}
                onChange={(e) => setParents((s) => ({ ...s, parent1_email: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Occupation (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={parents.parent1_occupation}
                onChange={(e) => setParents((s) => ({ ...s, parent1_occupation: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-slate-900">Home address (optional)</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={parents.home_address}
                onChange={(e) => setParents((s) => ({ ...s, home_address: e.target.value }))}
              />
            </div>

            <div className="md:col-span-2 border-t border-slate-200 pt-4">
              <div className="text-sm font-semibold text-slate-900">Second parent (optional)</div>
            </div>

            <div>
              <label className="text-sm font-semibold text-slate-900">Second parent name</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={parents.parent2_name}
                onChange={(e) => setParents((s) => ({ ...s, parent2_name: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Phone</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={parents.parent2_phone}
                onChange={(e) => setParents((s) => ({ ...s, parent2_phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Email</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={parents.parent2_email}
                onChange={(e) => setParents((s) => ({ ...s, parent2_email: e.target.value }))}
              />
            </div>
            <div>
              <label className="text-sm font-semibold text-slate-900">Occupation</label>
              <input
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={parents.parent2_occupation}
                onChange={(e) => setParents((s) => ({ ...s, parent2_occupation: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={saveParentsAndNext}
            >
              {saving ? "Saving…" : "Continue"}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              onClick={() => setStep("student")}
              disabled={saving}
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      {step === "previous" ? (
        <div className="mt-6">
          <div className="text-sm font-semibold text-slate-900">Previous school</div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-slate-900">Has your child been in school?</label>
              <select
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                value={previous.has_been_in_school}
                onChange={(e) => setPrevious((s) => ({ ...s, has_been_in_school: e.target.value }))}
              >
                <option value="">Select…</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            {previous.has_been_in_school === "yes" ? (
              <>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Name of school</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    value={previous.previous_school_name}
                    onChange={(e) => setPrevious((s) => ({ ...s, previous_school_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Reason for leaving</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    value={previous.reason_for_leaving}
                    onChange={(e) => setPrevious((s) => ({ ...s, reason_for_leaving: e.target.value }))}
                    placeholder="e.g. relocation"
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Date of entry (optional)</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    value={previous.date_of_entry}
                    onChange={(e) => setPrevious((s) => ({ ...s, date_of_entry: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Date of exit (optional)</label>
                  <input
                    type="date"
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    value={previous.date_of_exit}
                    onChange={(e) => setPrevious((s) => ({ ...s, date_of_exit: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Class of exit (optional)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    value={previous.class_of_exit}
                    onChange={(e) => setPrevious((s) => ({ ...s, class_of_exit: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm font-semibold text-slate-900">Qualification/Testimonial (optional)</label>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
                    value={previous.qualification_testimonial}
                    onChange={(e) => setPrevious((s) => ({ ...s, qualification_testimonial: e.target.value }))}
                  />
                </div>
              </>
            ) : null}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={savePreviousAndNext}
            >
              {saving ? "Saving…" : "Continue"}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              onClick={() => setStep("parents")}
              disabled={saving}
            >
              Back
            </button>
          </div>
        </div>
      ) : null}

      {step === "review" ? (
        <div className="mt-6">
          <div className="text-sm font-semibold text-slate-900">Review & submit</div>
          <div className="mt-2 text-sm text-slate-600">
            Confirm your details. You can also copy the resume link above and continue later.
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <SectionCard
              title="Quick details"
              description={`${quick.parent_name || "—"} • ${quick.phone || "—"} • ${quick.section || "—"}`}
            />
            <SectionCard
              title="Student"
              description={`${student.surname || ""} ${student.other_names || ""} • ${student.seeking_class || "—"}`}
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

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-brand-gold px-5 py-3 text-sm font-semibold text-slate-900 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={saving}
              onClick={submitApplication}
            >
              {saving ? "Submitting…" : "Submit application"}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50"
              onClick={() => setStep("previous")}
              disabled={saving}
            >
              Back
            </button>
          </div>

          {token ? (
            <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">What happens next</div>
              <div className="mt-2 text-sm text-slate-700">
                Our admissions team will review your application and contact you via your preferred method.
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6 text-xs text-slate-500">{saving ? "Saving…" : ""}</div>
    </div>
  );
}
