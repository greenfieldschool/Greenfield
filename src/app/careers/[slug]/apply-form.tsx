"use client";

import { useMemo, useState, useTransition } from "react";

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
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="text-sm font-semibold text-slate-900">Apply for this role</div>
      <p className="mt-2 text-sm text-slate-600">
        Submit your details and upload your CV. We’ll review and contact shortlisted candidates.
      </p>

      <form
        className="mt-6 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(e.currentTarget);
        }}
      >
        <input type="hidden" name="subject" value={subject} />

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Full name</label>
            <input
              name="name"
              required
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="Your full name"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Email</label>
            <input
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="you@example.com"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Phone (optional)</label>
            <input
              name="phone"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="Your phone number"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">CV (PDF or Word, max 8MB)</label>
            <input
              name="cv"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-slate-900"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-900">Message (optional)</label>
          <textarea
            name="message"
            className="mt-1 min-h-[110px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
            placeholder="A short note (experience, availability, why you’re a great fit)"
          />
        </div>

        {status === "success" ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">
            Submitted successfully. We’ll be in touch.
          </div>
        ) : null}

        {status === "error" ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-60"
        >
          {pending ? "Submitting…" : "Submit application"}
        </button>
      </form>
    </div>
  );
}
