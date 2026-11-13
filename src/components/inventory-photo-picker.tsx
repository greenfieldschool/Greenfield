"use client";

import { useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { INVENTORY_BUCKET, MAX_PHOTOS, MAX_PHOTO_BYTES } from "@/lib/inventory";
import { buttonClasses } from "@/components/ui/button";

/**
 * Shrinks a photo until it fits the 2MB limit (the school's rule), so staff never see "file too big": first to
 * 1600px on the long side, then smaller and lighter if needed. Returns null if the browser can't read the picture.
 */
async function fitPhoto(file: File): Promise<Blob | null> {
  if (file.size <= MAX_PHOTO_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type)) {
    // Already small enough; still re-encode big-pixel photos below to keep pages fast.
    if (file.size < 400 * 1024) return file;
  }
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
      if (blob && blob.size <= MAX_PHOTO_BYTES) return blob;
    }
    return null;
  } catch {
    return file.size <= MAX_PHOTO_BYTES && /^image\/(jpeg|png|webp)$/.test(file.type) ? file : null;
  }
}

export type PhotoRef = { path: string; url: string | null };

/** Up to 6 pictures for an inventory item; each is uploaded straight to the private bucket and its path is sent
 *  with the form as hidden `photos` inputs. Removing a picture here takes it off the item when the form is saved. */
export function InventoryPhotoPicker({ initial = [] }: { initial?: PhotoRef[] }) {
  const [photos, setPhotos] = useState<PhotoRef[]>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  async function onPick(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`Up to ${MAX_PHOTOS} pictures per item.`);
      return;
    }
    setBusy(true);
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("Pictures can't be uploaded right now (the database isn't connected).");
      setBusy(false);
      return;
    }
    const added: PhotoRef[] = [];
    for (const file of Array.from(files).slice(0, room)) {
      const blob = await fitPhoto(file);
      if (!blob) {
        setError(`"${file.name}" couldn't be read. Try a JPEG or PNG picture.`);
        continue;
      }
      const type = blob.type || "image/jpeg";
      const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
      const path = `items/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage.from(INVENTORY_BUCKET).upload(path, blob, { contentType: type, upsert: false });
      if (upErr) {
        setError(`"${file.name}" didn't upload: ${upErr.message}`);
        continue;
      }
      added.push({ path, url: URL.createObjectURL(blob) });
    }
    setPhotos((p) => [...p, ...added]);
    setBusy(false);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="space-y-3">
      {photos.map((p) => (
        <input key={p.path} type="hidden" name="photos" value={p.path} />
      ))}
      {photos.length ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {photos.map((p) => (
            <li key={p.path} className="relative aspect-square overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
              {p.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt="" className="h-full w-full object-cover" />
              ) : null}
              <button
                type="button"
                onClick={() => setPhotos((all) => all.filter((x) => x.path !== p.path))}
                className="absolute right-1 top-1 inline-flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow hover:bg-white"
                aria-label="Remove this picture"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <label className={buttonClasses({ variant: "secondary", size: "sm", className: photos.length >= MAX_PHOTOS || busy ? "pointer-events-none opacity-60" : "cursor-pointer" })}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Camera className="h-4 w-4" aria-hidden="true" />}
          {busy ? "Uploading…" : "Add pictures"}
          <input
            ref={input}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={busy || photos.length >= MAX_PHOTOS}
            onChange={(e) => onPick(e.target.files)}
          />
        </label>
        <span className="gf-hint">
          Up to {MAX_PHOTOS} pictures. Big phone photos are made smaller automatically (2MB limit).
        </span>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
