"use client";

import { useRef, useState } from "react";
import { Camera, FileUp, Loader2, Paperclip, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ASSIGNMENT_BUCKET, MAX_FILE_BYTES, storageFileName } from "@/lib/assignments";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

const ACCEPT = "image/*,application/pdf,.doc,.docx,.ppt,.pptx,.txt";

/** Photos from phones are big: shrink them to at most 1800px on the long side as a JPEG before uploading. */
async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    // The browser can't read this picture (e.g. some HEIC photos): upload it as it is.
    return file;
  }
}

/**
 * Picks a photo or file, uploads it straight to the private assignment bucket under `folder` (the bucket's rules
 * decide who may), and puts its path, name and type in hidden inputs for the surrounding form. Shows the current file
 * when there is one.
 */
export function AssignmentFilePicker({
  folder,
  current,
  label = "Add a photo or file",
  disabled = false,
  bucket = ASSIGNMENT_BUCKET,
  accept = ACCEPT,
  maxBytes = MAX_FILE_BYTES,
  hint = "Photos, PDF or Word, up to 10 MB. Photos are made smaller automatically.",
  camera: showCamera = true
}: {
  /** "briefs/<assignment>" or "work/<assignment>/<pupil>" (no trailing slash). */
  folder: string;
  current?: { path: string; name: string | null; type?: string | null; url?: string | null } | null;
  label?: string;
  disabled?: boolean;
  /** Another private bucket with its own rules (lesson notes use "lesson-notes"). */
  bucket?: string;
  accept?: string;
  maxBytes?: number;
  hint?: string;
  /** Show "Take a photo" on phones. */
  camera?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState(current ? { path: current.path, name: current.name ?? "File", type: current.type ?? "", url: current.url ?? null } : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const pick = async (chosen: File | undefined) => {
    setError("");
    if (!chosen) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setError("Uploading isn't available right now. Please try again later.");
    setBusy(true);
    try {
      const ready = await shrinkPhoto(chosen);
      if (ready.size > maxBytes) {
        setError(`That file is too big. Choose one under ${Math.round(maxBytes / 1048576)} MB${showCamera ? ", or take a photo instead" : ""}.`);
        return;
      }
      const path = `${folder}/${storageFileName(ready.name)}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, ready, {
        contentType: ready.type || "application/octet-stream",
        upsert: false
      });
      if (uploadError) {
        setError(/mime|type/i.test(uploadError.message) ? "That kind of file can't be uploaded. Use a photo, PDF, Word or PowerPoint document." : "The upload didn't work. Check your connection and try again.");
        return;
      }
      setFile({ path, name: chosen.name, type: ready.type, url: URL.createObjectURL(ready) });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
      if (camera.current) camera.current.value = "";
    }
  };

  return (
    <div>
      <input type="hidden" name="file_path" value={file?.path ?? ""} />
      <input type="hidden" name="file_name" value={file?.name ?? ""} />
      <input type="hidden" name="file_type" value={file?.type ?? ""} />
      <input ref={input} type="file" accept={accept} className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />
      <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(e) => pick(e.target.files?.[0])} />

      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
          {file.type.startsWith("image/") && file.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={file.url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Paperclip className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-900">{file.name}</div>
            {file.url ? (
              <a href={file.url} target="_blank" rel="noreferrer" className="text-xs font-semibold text-brand-green-700 hover:underline">
                Open
              </a>
            ) : null}
          </div>
          {disabled ? null : (
            <button
              type="button"
              onClick={() => setFile(null)}
              aria-label="Remove this file"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      ) : disabled ? null : (
        <div className="flex flex-wrap gap-2">
          {showCamera ? (
            <button type="button" disabled={busy} onClick={() => camera.current?.click()} className={cn(buttonClasses({ variant: "secondary" }), "sm:hidden")}>
              <Camera className="h-4 w-4" aria-hidden="true" />
              Take a photo
            </button>
          ) : null}
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={buttonClasses({ variant: "secondary" })}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileUp className="h-4 w-4" aria-hidden="true" />}
            {busy ? "Uploading…" : label}
          </button>
        </div>
      )}
      {error ? <p className="mt-1.5 text-sm text-red-700">{error}</p> : null}
      {!file && !disabled ? <p className="gf-hint mt-1.5">{hint}</p> : null}
    </div>
  );
}
