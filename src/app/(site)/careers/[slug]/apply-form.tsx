"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FormSection } from "@/components/ui/form-section";
import Link from "next/link";

type Props = {
  jobSlug: string;
  jobTitle: string;
};

type ApplyApiResponse = {
  ok: boolean;
  error?: string;
};

export function CareerApplyForm({ jobSlug, jobTitle }: Props) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [error, setError] = useState<string>("");

  const subject = useMemo(() => `Application: ${jobTitle}`, [jobTitle]);

  function onSubmit(form: HTMLFormElement) {
    setStatus("idle");
    setError("");

    const fd = new FormData(form);
    fd.set("job_slug", jobSlug);
    fd.set("job_title", jobTitle);

    startTransition(async () => {
      const res = await fetch("/api/careers/apply", {
        method: "POST",
        body: fd
      }).catch(() => null);

      const json = (res ? ((await res.json().catch(() => null)) as ApplyApiResponse | null) : null) as
        | ApplyApiResponse
        | null;

      if (!res || !res.ok || !json?.ok) {
        setStatus("error");
        setError(String(json?.error || "Something went wrong. Please try again."));
        return;
      }

      setStatus("success");
      form.reset();
    });
  }

  return (
    <form
      id="apply"
      className="scroll-mt-24"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(e.currentTarget);
      }}
    >
      <input type="hidden" name="subject" value={subject} />

      <FormSection
        title="Apply for this role"
        description={
          <>
            Submit your details and upload your CV. We&apos;ll review and contact shortlisted candidates. We use your
            application only for recruitment, as described in our{" "}
            <Link href="/privacy" className="font-medium text-brand-green underline underline-offset-2">
              privacy policy
            </Link>
            .
          </>
        }
        footer={
          <Button type="submit" disabled={pending} size="lg" className="w-full sm:w-auto">
            {pending ? "Submitting…" : "Submit application"}
          </Button>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="career-name" required>
              <input id="career-name" name="name" required className="gf-input" placeholder="Your full name" autoComplete="name" />
            </Field>
            <Field label="Email" htmlFor="career-email" required>
              <input
                id="career-email"
                name="email"
                type="email"
                required
                className="gf-input"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </Field>
            <Field label="Phone (optional)" htmlFor="career-phone">
              <input id="career-phone" name="phone" className="gf-input" placeholder="Your phone number" autoComplete="tel" />
            </Field>
            <Field label="CV (PDF or Word, max 8MB)" htmlFor="career-cv">
              <input
                id="career-cv"
                name="cv"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="gf-input py-2 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-green-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-brand-green-700 hover:file:bg-brand-green-100"
              />
            </Field>
          </div>

          <Field label="Message (optional)" htmlFor="career-message">
            <textarea
              id="career-message"
              name="message"
              className="gf-input min-h-[120px]"
              placeholder="A short note (experience, availability, why you’re a great fit)"
            />
          </Field>

          {status === "success" ? <Alert tone="success">Submitted successfully. We’ll be in touch.</Alert> : null}
          {status === "error" ? <Alert tone="danger">{error}</Alert> : null}
        </div>
      </FormSection>
    </form>
  );
}
