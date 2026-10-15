"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { ImageIcon, Trash2, Upload } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

type Props = {
  studentId: string;
  initialUrl: string | null;
  saveAction: (formData: FormData) => Promise<void>;
};

function safeExtFromTypeOrName(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  if (file.name.includes(".")) {
    const ext = file.name.split(".").pop() ?? "";
    const cleaned = ext.toLowerCase().replace(/[^a-z0-9]/g, "");
    return cleaned || "jpg";
  }
  return "jpg";
}

export default function StudentPhotoUploader({ studentId, initialUrl, saveAction }: Props) {
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);

  const bucket = useMemo(
    () => (process.env.NEXT_PUBLIC_STUDENT_PHOTOS_BUCKET ?? "student-photos").trim(),
    []
  );

  async function persistUrl(url: string | null) {
    const form = new FormData();
    form.set("profile_photo_url", url ?? "");

    startTransition(async () => {
      await saveAction(form);
    });
  }

  async function handleFile(file: File) {
    setError(null);

    const maxBytes = 5 * 1024 * 1024;
    if (!file.size || file.size > maxBytes) {
      setError("Photo must be less than 5MB.");
      return;
    }

    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (file.type && !allowedTypes.includes(file.type)) {
      setError("Photo must be a PNG, JPG, or WEBP image.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    const ext = safeExtFromTypeOrName(file);
    const id = globalThis.crypto?.randomUUID
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const path = `students/${studentId}/${id}.${ext}`;

    const bytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage.from(bucket).upload(path, bytes, {
      contentType: file.type || undefined,
      upsert: true
    });

    if (uploadError) {
      setError("Upload failed. Please check Storage permissions/policies and try again.");
      return;
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const publicUrl = data?.publicUrl ?? null;

    if (!publicUrl) {
      setError("Upload succeeded but we could not generate a public URL.");
      return;
    }

    setPreviewUrl(publicUrl);
    await persistUrl(publicUrl);
  }

  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleFile(file);
  }

  async function onFileChange(e: FormEvent<HTMLInputElement>) {
    const target = e.currentTarget;
    const file = target.files?.[0];
    if (file) await handleFile(file);
    target.value = "";
  }

  return (
    <div className="space-y-3">
      <form ref={formRef} action={saveAction}>
        <input type="hidden" name="profile_photo_url" value={previewUrl ?? ""} />
      </form>

      <div
        className={cn(
          "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed p-5 text-center transition-colors sm:flex-row sm:text-left",
          dragOver ? "border-brand-green-400 bg-brand-green-50" : "border-slate-200 bg-slate-50/60 hover:border-slate-300"
        )}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Student photo"
            width={96}
            height={96}
            unoptimized
            className="h-24 w-24 shrink-0 rounded-2xl border border-slate-200 bg-white object-cover"
          />
        ) : (
          <span className="inline-flex h-24 w-24 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400">
            <ImageIcon className="h-8 w-8" aria-hidden="true" />
          </span>
        )}

        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-900">Student photo</div>
          <div className="mt-0.5 text-xs text-slate-500">
            {previewUrl ? "Drag & drop a new image, or click to choose." : "No photo uploaded yet. Drag & drop an image, or click to choose."}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2 sm:justify-start">
            <button
              type="button"
              disabled={pending}
              className={buttonClasses({ variant: "secondary", size: "sm" })}
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {pending ? "Saving…" : "Choose file"}
            </button>
            <button
              type="button"
              disabled={pending || !previewUrl}
              className={buttonClasses({ variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50 hover:text-red-700" })}
              onClick={async () => {
                setError(null);
                setPreviewUrl(null);
                await persistUrl(null);
              }}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
              Remove
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label="Upload student photo"
          onChange={onFileChange}
        />
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}
      <p className="gf-hint">PNG, JPG or WEBP up to 5MB · Storage bucket: {bucket}</p>
    </div>
  );
}
