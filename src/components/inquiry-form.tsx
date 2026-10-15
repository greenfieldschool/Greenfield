"use client";

import { useMemo, useState } from "react";
import { buttonClasses } from "@/components/ui/button";
import Link from "next/link";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function InquiryForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<FormState>({ status: "idle" });

  const canSubmit = useMemo(() => {
    return name.trim().length >= 2 && email.trim().length >= 5 && message.trim().length >= 10;
  }, [name, email, message]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!canSubmit || state.status === "submitting") return;

    setState({ status: "submitting" });

    try {
      const res = await fetch("/api/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message })
      });

      const data = (await res.json()) as { ok: boolean; message?: string; error?: string };

      if (!res.ok || !data.ok) {
        setState({ status: "error", message: data.error ?? "Something went wrong." });
        return;
      }

      setState({ status: "success", message: data.message ?? "Thanks! We’ll be in touch soon." });
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setState({ status: "error", message: "Network error. Please try again." });
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} aria-live="polite">
      <div>
        <label htmlFor="inquiry-name" className="gf-label">Full name</label>
        <input
          id="inquiry-name"
          className="gf-input"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          required
        />
      </div>
      <div>
        <label htmlFor="inquiry-email" className="gf-label">Email</label>
        <input
          id="inquiry-email"
          className="gf-input"
          name="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </div>
      <div>
        <label htmlFor="inquiry-message" className="gf-label">Message</label>
        <textarea
          id="inquiry-message"
          className="gf-input min-h-[120px]"
          name="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="How can we help?"
          required
        />
      </div>

      {state.status === "error" ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {state.message}
        </div>
      ) : null}

      {state.status === "success" ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {state.message}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit || state.status === "submitting"}
        className={buttonClasses({ size: "lg", className: "w-full" })}
      >
        {state.status === "submitting" ? "Sending…" : "Send enquiry"}
      </button>

      <p className="text-xs text-slate-500">
        We&apos;ll use your details only to reply to your enquiry. See our{" "}
        <Link href="/privacy" className="font-medium text-brand-green underline underline-offset-2">
          privacy policy
        </Link>
        .
      </p>
    </form>
  );
}
