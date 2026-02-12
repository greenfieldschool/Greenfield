"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

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
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <form
        className="space-y-6"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(() => save(fd));
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Title</label>
            <input
              name="title"
              defaultValue={defaults.title}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="e.g. Primary Class Teacher"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Slug</label>
            <input
              name="slug"
              defaultValue={defaults.slug}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="e.g. primary-class-teacher"
            />
            <div className="mt-1 text-xs text-slate-500">Used in the URL: /careers/slug</div>
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Location</label>
            <input
              name="location"
              defaultValue={defaults.location}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="e.g. Lekki, Lagos"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Employment type</label>
            <input
              name="employment_type"
              defaultValue={defaults.employment_type}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="e.g. Full-time"
            />
          </div>
        </div>

        <div>
          <label className="text-sm font-semibold text-slate-900">Summary</label>
          <textarea
            name="summary"
            defaultValue={defaults.summary}
            className="mt-1 min-h-[120px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
            placeholder="1–3 sentences. What is this role and why should a great candidate apply?"
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Responsibilities (one per line)</label>
            <textarea
              name="responsibilities"
              defaultValue={joinLines(defaults.responsibilities)}
              className="mt-1 min-h-[160px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Requirements (one per line)</label>
            <textarea
              name="requirements"
              defaultValue={joinLines(defaults.requirements)}
              className="mt-1 min-h-[160px] w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-semibold text-slate-900">Reports to (optional)</label>
            <input
              name="reports_to"
              defaultValue={defaults.reports_to ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Compensation (optional)</label>
            <input
              name="compensation"
              defaultValue={defaults.compensation ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-semibold text-slate-900">Apply email (optional)</label>
            <input
              name="apply_email"
              defaultValue={defaults.apply_email ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="e.g. hr@greenfieldschool.ng"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Apply WhatsApp (optional)</label>
            <input
              name="apply_whatsapp"
              defaultValue={defaults.apply_whatsapp ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="e.g. https://wa.me/234..."
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-slate-900">Apply link (optional)</label>
            <input
              name="apply_link"
              defaultValue={defaults.apply_link ?? ""}
              className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-brand-green"
              placeholder="e.g. Google Form URL"
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800 transition">
            {error}
          </div>
        ) : null}

        {canShowSaved ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800 transition">
            Saved at {savedAt}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="flex items-center gap-3 text-sm font-semibold text-slate-900">
            <input
              type="checkbox"
              name="published"
              defaultChecked={Boolean(defaults.published)}
              className="h-4 w-4 rounded border-slate-300"
            />
            Published
          </label>

          <button
            type="submit"
            disabled={pending}
            className="inline-flex w-full items-center justify-center rounded-xl bg-brand-green px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60 sm:w-auto"
          >
            <span className={pending ? "animate-pulse" : ""}>{savingLabel}</span>
          </button>
        </div>

        <div className="text-xs text-slate-500">
          {pending ? "Saving your changes…" : "Changes are saved when you click Save."}
        </div>
      </form>
    </div>
  );
}
