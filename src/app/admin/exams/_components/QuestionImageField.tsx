"use client";

import { useRef, useState, type DragEvent } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const QUESTION_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function extFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/jpeg") return "jpg";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  const ext = (file.name.split(".").pop() ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return ext || "jpg";
}

// Picture for an exam question. Uploads straight to Supabase Storage from the browser and keeps the
// public URL in a hidden `image_url` input, so the surrounding server-action form saves it.
// `image_url_original` lets the server tell "unchanged" from "removed".
export default function QuestionImageField({
  testId,
  initialUrl,
  disabled,
  id
}: {
  testId: string;
  initialUrl: string | null;
  disabled?: boolean;
  id: string;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const bucket = (process.env.NEXT_PUBLIC_EXAM_IMAGES_BUCKET ?? "exam-images").trim();

  async function handleFile(file: File) {
    setError(null);
    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      setError("Use a PNG, JPG, WEBP or GIF picture.");
      return;
    }
    if (!file.size || file.size > QUESTION_IMAGE_MAX_BYTES) {
      setError(`This picture is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The limit is 2 MB.`);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Supabase is not configured.");
      return;
    }

    setUploading(true);
    try {
      const name = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const path = `tests/${testId}/${name}.${extFor(file)}`;
      const { error: uploadError } = await supabase.storage.from(bucket).upload(path, file, {
        contentType: file.type || undefined,
        upsert: false
      });
      if (uploadError) {
        setError(`Upload failed: ${uploadError.message}`);
        return;
      }
      const { data } = supabase.storage.from(bucket).getPublicUrl(path);
      if (!data?.publicUrl) {
        setError("Upload worked but no picture link came back. Please try again.");
        return;
      }
      setUrl(data.publicUrl);
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div>
      <input type="hidden" name="image_url" value={url ?? ""} />
      <input type="hidden" name="image_url_original" value={initialUrl ?? ""} />

      <div
        className={cn(
          "flex flex-col gap-3 rounded-xl border-2 border-dashed p-3 transition-colors sm:flex-row sm:items-center",
          dragOver ? "border-brand-green-400 bg-brand-green-50" : "border-slate-200 bg-slate-50/60"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" className="block shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Question picture" className="max-h-40 max-w-full rounded-lg border border-slate-200 bg-white object-contain sm:max-w-xs" />
          </a>
        ) : null}

        <div className="min-w-0 flex-1">
          {!disabled ? (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={uploading}
                className={buttonClasses({ variant: "secondary", size: "sm" })}
                onClick={() => inputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ImagePlus className="h-4 w-4" aria-hidden="true" />
                )}
                {uploading ? "Uploading…" : url ? "Change picture" : "Add picture"}
              </button>
              {url ? (
                <button
                  type="button"
                  disabled={uploading}
                  className={buttonClasses({ variant: "ghost", size: "sm", className: "text-red-600 hover:bg-red-50 hover:text-red-700" })}
                  onClick={() => {
                    setError(null);
                    setUrl(null);
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Remove
                </button>
              ) : null}
            </div>
          ) : !url ? (
            <p className="text-xs text-slate-500">No picture.</p>
          ) : null}
          {!disabled ? (
            <p className="mt-1.5 text-xs text-slate-500">
              PNG, JPG, WEBP or GIF up to 2 MB. Drag a picture here or click the button.
              {url !== initialUrl ? " Save the question to keep this change." : ""}
            </p>
          ) : null}
          {error ? (
            <p className="mt-1.5 text-xs font-medium text-red-600" role="alert">
              {error}
            </p>
          ) : null}
        </div>

        <input
          ref={inputRef}
          id={id}
          type="file"
          accept={ALLOWED_TYPES.join(",")}
          className="hidden"
          aria-label="Choose a picture for this question"
          disabled={disabled}
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            e.currentTarget.value = "";
            if (file) void handleFile(file);
          }}
        />
      </div>
    </div>
  );
}
