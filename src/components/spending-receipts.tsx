"use client";

import { useRef, useState } from "react";
import { Camera, FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { MAX_FILE_BYTES, MAX_RECEIPTS, NO_RECEIPT_REASONS, SPENDING_BUCKET } from "@/lib/spending";
import { buttonClasses } from "@/components/ui/button";

// Receipts, invoices and payment slips for spending requests. Files go from the browser straight to the private
// "spending-files" bucket under the person's own folder (never through a server action: Vercel caps request bodies).
// Photos are shrunk below 2MB rather than refused; PDFs must already be under 2MB. Each file's SHA-256 is sent with
// it so the database can refuse the same receipt used twice.

type Uploaded = { path: string; hash: string; previewUrl: string | null; isPdf: boolean; name: string };

async function shrinkPhoto(file: File): Promise<Blob | null> {
  if (file.size <= 400 * 1024 && /^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    for (const [edge, quality] of [
      [1600, 0.82],
      [1280, 0.75],
      [1024, 0.7],
      [800, 0.65]
    ] as const) {
      const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
      if (blob && blob.size <= MAX_FILE_BYTES) return blob;
    }
    return null;
  } catch {
    return file.size <= MAX_FILE_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type) ? file : null;
  }
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function uploadOne(file: File): Promise<Uploaded | string> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return "Files can't be uploaded right now (the database isn't connected).";
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return "Please sign in again, then add the file.";
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  let blob: Blob | null;
  if (isPdf) {
    if (file.size > MAX_FILE_BYTES) return `"${file.name}" is over 2MB. Take a photo of it instead, or make the PDF smaller.`;
    blob = file;
  } else {
    blob = await shrinkPhoto(file);
    if (!blob) return `"${file.name}" couldn't be read. Try a JPEG or PNG photo.`;
  }
  const type = isPdf ? "application/pdf" : blob.type || "image/jpeg";
  const ext = isPdf ? "pdf" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;
  const hash = await sha256(blob);
  const { error } = await supabase.storage.from(SPENDING_BUCKET).upload(path, blob, { contentType: type, upsert: false });
  if (error) return `"${file.name}" didn't upload: ${error.message}`;
  return { path, hash, previewUrl: isPdf ? null : URL.createObjectURL(blob), isPdf, name: file.name };
}

function FileButton({
  label,
  busy,
  disabled,
  onFile
}: {
  label: string;
  busy: boolean;
  disabled?: boolean;
  onFile: (f: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <label className={buttonClasses({ variant: "secondary", size: "sm", className: disabled || busy ? "pointer-events-none opacity-60" : "cursor-pointer" })}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
      {busy ? "Uploading…" : label}
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        disabled={disabled || busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          if (input.current) input.current.value = "";
        }}
      />
    </label>
  );
}

function Thumb({ file }: { file: Uploaded }) {
  return file.previewUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={file.previewUrl} alt="" className="h-16 w-16 rounded-lg border border-slate-200 object-cover" />
  ) : (
    <span className="inline-flex h-16 w-16 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-500">
      <FileText className="h-6 w-6" aria-hidden="true" />
      <span className="sr-only">PDF</span>
    </span>
  );
}

type Row = { key: string; file: Uploaded | null; amount: string; vendor: string; spentOn: string; reason: string; phone: string; note: string };

const today = () => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
const blank = (): Row => ({ key: crypto.randomUUID(), file: null, amount: "", vendor: "", spentOn: today(), reason: "", phone: "", note: "" });

/**
 * Receipts as a list of rows, sent with the form as one hidden `receipts` input (JSON).
 * mode "request": invoice or receipt photos when asking (a photo is required on every row).
 * mode "accounting": one receipt at a time after an advance; a row may have no photo, with a reason from the list.
 */
export function SpendingReceipts({ mode, defaultVendor = "" }: { mode: "request" | "accounting"; defaultVendor?: string }) {
  const [rows, setRows] = useState<Row[]>([{ ...blank(), vendor: defaultVendor }]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const single = mode === "accounting";

  const update = (key: string, patch: Partial<Row>) => setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function pick(key: string, f: File) {
    setError(null);
    setBusyKey(key);
    const res = await uploadOne(f);
    setBusyKey(null);
    if (typeof res === "string") setError(res);
    else update(key, { file: res });
  }

  const payload = rows.map((r) => ({
    path: r.file?.path ?? null,
    hash: r.file?.hash ?? null,
    amount: r.amount.replace(/[₦,\s]/g, ""),
    vendor: r.vendor,
    spent_on: r.spentOn,
    no_receipt_reason: r.file ? null : r.reason || null,
    seller_phone: r.phone || null,
    note: r.note || null
  }));
  const total = rows.reduce((s, r) => s + (Number(r.amount.replace(/[₦,\s]/g, "")) || 0), 0);

  return (
    <div className="space-y-4">
      <input type="hidden" name="receipts" value={JSON.stringify(payload)} />
      <ul className="space-y-3">
        {rows.map((r, i) => (
          <li key={r.key} className="rounded-xl border border-slate-200 p-3 sm:p-4">
            <div className="flex flex-wrap items-start gap-3">
              {r.file ? <Thumb file={r.file} /> : null}
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <FileButton
                  label={r.file ? "Change photo" : mode === "request" ? "Add photo or PDF" : "Add receipt photo"}
                  busy={busyKey === r.key}
                  onFile={(f) => pick(r.key, f)}
                />
                {r.file ? <span className="gf-hint truncate">{r.file.name}</span> : null}
              </div>
              {!single && rows.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}
                  className={buttonClasses({ variant: "ghost", size: "sm" })}
                  aria-label={`Remove receipt ${i + 1}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="gf-label">Amount (₦)</span>
                <input className="gf-input text-right tabular-nums" inputMode="decimal" required value={r.amount} onChange={(e) => update(r.key, { amount: e.target.value })} />
              </label>
              <label className="block">
                <span className="gf-label">Paid to (seller)</span>
                <input className="gf-input" required maxLength={120} value={r.vendor} onChange={(e) => update(r.key, { vendor: e.target.value })} />
              </label>
              <label className="block">
                <span className="gf-label">Date on the receipt</span>
                <input className="gf-input" type="date" required max={today()} value={r.spentOn} onChange={(e) => update(r.key, { spentOn: e.target.value })} />
              </label>
            </div>
            {single && !r.file ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="gf-label">No receipt? Say why</span>
                  <select className="gf-select" value={r.reason} onChange={(e) => update(r.key, { reason: e.target.value })}>
                    <option value="">I&apos;ll add a photo</option>
                    {NO_RECEIPT_REASONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {r.reason ? (
                  <label className="block">
                    <span className="gf-label">Seller&apos;s phone (if you have it)</span>
                    <input className="gf-input" inputMode="tel" maxLength={20} value={r.phone} onChange={(e) => update(r.key, { phone: e.target.value })} />
                  </label>
                ) : null}
              </div>
            ) : null}
            {single ? (
              <label className="mt-3 block">
                <span className="gf-label">Note {r.reason === "other" ? "(required: explain)" : "(optional)"}</span>
                <input className="gf-input" maxLength={300} value={r.note} onChange={(e) => update(r.key, { note: e.target.value })} />
              </label>
            ) : null}
          </li>
        ))}
      </ul>
      {!single ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            disabled={rows.length >= MAX_RECEIPTS}
            onClick={() => setRows((all) => [...all, blank()])}
            className={buttonClasses({ variant: "ghost", size: "sm" })}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Another receipt
          </button>
          <span className="text-sm text-slate-600">
            Receipts total <strong className="tabular-nums">₦{total.toLocaleString("en-NG")}</strong>
          </span>
        </div>
      ) : null}
      <p className="gf-hint">Big phone photos are made smaller automatically (2MB limit). PDFs must be under 2MB.</p>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** One file (a payment slip), sent as hidden `slip_path`. */
export function SpendingSlip() {
  const [file, setFile] = useState<Uploaded | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-2">
      <input type="hidden" name="slip_path" value={file?.path ?? ""} />
      <div className="flex flex-wrap items-center gap-3">
        {file ? <Thumb file={file} /> : null}
        <FileButton
          label={file ? "Change slip" : "Add slip photo"}
          busy={busy}
          onFile={async (f) => {
            setError(null);
            setBusy(true);
            const res = await uploadOne(f);
            setBusy(false);
            if (typeof res === "string") setError(res);
            else setFile(res);
          }}
        />
      </div>
      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
