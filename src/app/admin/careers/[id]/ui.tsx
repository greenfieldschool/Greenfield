"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { FormSection, Field } from "@/components/ui/form-section";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";

type Job = {
  id?: string;
  slug: string;
  title: string;
  location: string;
  employment_type: string;
  summary: string;
  responsibilities: string[];
  requirements: string[];
  reports_to?: string | null;
  compensation?: string | null;
  apply_email?: string | null;
  apply_whatsapp?: string | null;
  apply_link?: string | null;
  published: boolean;
};

type Props = {
  id: string;
  initialJob: Job;
};

type SaveResponse = { ok: boolean; id?: string; error?: string };

function joinLines(list: string[] | undefined) {
  return Array.isArray(list) ? list.join("\n") : "";
}

export function AdminCareerJobEditor({ id, initialJob }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<string>("");
  const [error, setError] = useState<string>("");

  const canShowSaved = Boolean(savedAt);
  const savingLabel = pending ? "Saving…" : "Save";

  const defaults = useMemo(() => initialJob, [initialJob]);

  async function save(formData: FormData) {
    setError("");
    setSavedAt("");

    const payload = {
      id,
      title: String(formData.get("title") ?? ""),
      slug: String(formData.get("slug") ?? ""),
      location: String(formData.get("location") ?? ""),
      employment_type: String(formData.get("employment_type") ?? ""),
      summary: String(formData.get("summary") ?? ""),
      responsibilities: String(formData.get("responsibilities") ?? ""),
      requirements: String(formData.get("requirements") ?? ""),
      reports_to: String(formData.get("reports_to") ?? ""),
      compensation: String(formData.get("compensation") ?? ""),
      apply_email: String(formData.get("apply_email") ?? ""),
      apply_whatsapp: String(formData.get("apply_whatsapp") ?? ""),
      apply_link: String(formData.get("apply_link") ?? ""),
      published: Boolean(formData.get("published"))
    };

    const res = await fetch("/api/admin/careers/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(() => null);

    const json = (res ? ((await res.json().catch(() => null)) as SaveResponse | null) : null) as
      | SaveResponse
      | null;

    if (!res || !res.ok || !json?.ok) {
      setError(String(json?.error || "Could not save. Please check the form and try again."));
      return;
    }

    const now = new Date();
    setSavedAt(now.toLocaleTimeString());

    if (id === "new" && json.id) {
      router.replace(`/admin/careers/${json.id}`);
      router.refresh();
      return;
    }

    router.refresh();
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => save(fd));
      }}
    >
      <FormSection title="Role" description="The basics candidates see first.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Title" htmlFor="job-title">
            <input
              id="job-title"
              name="title"
              defaultValue={defaults.title}
              className="gf-input"
              placeholder="e.g. Primary Class Teacher"
            />
          </Field>
          <Field label="Slug" htmlFor="job-slug" hint="Used in the URL: /careers/slug">
            <input
              id="job-slug"
              name="slug"
              defaultValue={defaults.slug}
              className="gf-input font-mono"
              placeholder="e.g. primary-class-teacher"
            />
          </Field>
          <Field label="Location" htmlFor="job-location">
            <input
              id="job-location"
              name="location"
              defaultValue={defaults.location}
              className="gf-input"
              placeholder="e.g. Lekki, Lagos"
            />
          </Field>
          <Field label="Employment type" htmlFor="job-type">
            <input
              id="job-type"
              name="employment_type"
              defaultValue={defaults.employment_type}
              className="gf-input"
              placeholder="e.g. Full-time"
            />
          </Field>
          <Field label="Summary" htmlFor="job-summary" className="md:col-span-2">
            <textarea
              id="job-summary"
              name="summary"
              defaultValue={defaults.summary}
              className="gf-input min-h-[120px]"
              placeholder="1–3 sentences. What is this role and why should a great candidate apply?"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Details" description="One item per line.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Responsibilities (one per line)" htmlFor="job-responsibilities">
            <textarea
              id="job-responsibilities"
              name="responsibilities"
              defaultValue={joinLines(defaults.responsibilities)}
              className="gf-input min-h-[160px]"
            />
          </Field>
          <Field label="Requirements (one per line)" htmlFor="job-requirements">
            <textarea
              id="job-requirements"
              name="requirements"
              defaultValue={joinLines(defaults.requirements)}
              className="gf-input min-h-[160px]"
            />
          </Field>
          <Field label="Reports to (optional)" htmlFor="job-reports-to">
            <input id="job-reports-to" name="reports_to" defaultValue={defaults.reports_to ?? ""} className="gf-input" />
          </Field>
          <Field label="Compensation (optional)" htmlFor="job-compensation">
            <input
              id="job-compensation"
              name="compensation"
              defaultValue={defaults.compensation ?? ""}
              className="gf-input"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection title="How to apply" description="Optional extra ways for candidates to apply.">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Apply email (optional)" htmlFor="job-apply-email">
            <input
              id="job-apply-email"
              name="apply_email"
              defaultValue={defaults.apply_email ?? ""}
              className="gf-input"
              placeholder="e.g. hr@greenfieldschool.ng"
            />
          </Field>
          <Field label="Apply WhatsApp (optional)" htmlFor="job-apply-whatsapp">
            <input
              id="job-apply-whatsapp"
              name="apply_whatsapp"
              defaultValue={defaults.apply_whatsapp ?? ""}
              className="gf-input"
              placeholder="e.g. https://wa.me/234..."
            />
          </Field>
          <Field label="Apply link (optional)" htmlFor="job-apply-link">
            <input
              id="job-apply-link"
              name="apply_link"
              defaultValue={defaults.apply_link ?? ""}
              className="gf-input"
              placeholder="e.g. Google Form URL"
            />
          </Field>
        </div>
      </FormSection>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      {canShowSaved ? <Alert tone="success">Saved at {savedAt}</Alert> : null}

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white/95 px-5 py-4 shadow-lift backdrop-blur">
        <div>
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <input type="checkbox" name="published" defaultChecked={Boolean(defaults.published)} className="gf-checkbox" />
            Published
          </label>
          <div className="mt-1 text-xs text-slate-500">
            {pending ? "Saving your changes…" : "Changes are saved when you click Save."}
          </div>
        </div>

        <button type="submit" disabled={pending} className={buttonClasses({ className: "w-full sm:w-auto" })}>
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Save className="h-4 w-4" aria-hidden="true" />
          )}
          {savingLabel}
        </button>
      </div>
    </form>
  );
}
