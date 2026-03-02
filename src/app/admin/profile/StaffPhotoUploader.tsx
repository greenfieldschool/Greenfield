"use client";

import Image from "next/image";
import { useMemo, useRef, useState, useTransition, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Props = {
  userId: string;
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

export default function StaffPhotoUploader({ userId, initialUrl, saveAction }: Props) {
  const [pending, startTransition] = useTransition();
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(initialUrl);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const bucket = useMemo(() => (process.env.NEXT_PUBLIC_STAFF_PHOTOS_BUCKET ?? "staff-photos").trim(), []);

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

    const path = `staff/${userId}/${id}.${ext}`;

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
      <div
        className={
          "flex flex-col gap-3 rounded-2xl border border-dashed p-4 transition-colors " +
          (dragOver
            ? "border-brand-green bg-emerald-50"
            : "border-slate-300 bg-white hover:bg-slate-50")
        }
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
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">Profile photo</div>
            <div className="mt-1 text-xs text-slate-600">Drag & drop an image, or click to choose.</div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={pending}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
            >
              Choose file
            </button>
            <button
              type="button"
              disabled={pending || !previewUrl}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50"
              onClick={async () => {
                setError(null);
                setPreviewUrl(null);
                await persistUrl(null);
              }}
            >
              Remove
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={onFileChange}
        />

        {previewUrl ? (
          <Image
            src={previewUrl}
            alt="Profile photo"
            width={160}
            height={160}
            unoptimized
            className="h-40 w-40 rounded-2xl border border-slate-200 object-cover"
          />
        ) : (
          <div className="text-xs text-slate-600">No photo uploaded yet.</div>
        )}
      </div>

      {error ? <div className="text-sm font-semibold text-red-600">{error}</div> : null}
      <div className="text-xs text-slate-500">Storage bucket: {bucket}</div>
    </div>
  );
}
