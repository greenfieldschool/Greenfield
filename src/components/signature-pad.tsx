"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImageUp, RotateCcw, Trash2 } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import SubmitButton from "@/components/submit-button";

// Draw a signature with a finger, stylus or mouse (or upload a photo of one), then save it as a small PNG with a
// see-through background, cropped to the ink, so it prints cleanly on certificates.

type Point = { x: number; y: number };
const INK = "#1e293b";
const MAX_WIDTH = 900;

export default function SignaturePad({
  action,
  defaultName
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultName: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const uploaded = useRef<HTMLImageElement | null>(null);
  const drawing = useRef(false);
  const [empty, setEmpty] = useState(true);
  const [data, setData] = useState("");
  const [uploadError, setUploadError] = useState("");

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (uploaded.current) {
      const img = uploaded.current;
      const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.92;
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      // Paper turns see-through: anything light becomes transparent, the ink stays.
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < px.data.length; i += 4) {
        const light = 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
        if (light > 170) px.data[i + 3] = 0;
      }
      ctx.putImageData(px, 0, 0);
    }
    const dpr = canvas.width / canvas.getBoundingClientRect().width || 1;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4 * dpr;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const stroke of strokes.current) {
      ctx.beginPath();
      stroke.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else {
          const prev = stroke[i - 1];
          ctx.quadraticCurveTo(prev.x, prev.y, (prev.x + p.x) / 2, (prev.y + p.y) / 2);
        }
      });
      if (stroke.length === 1) ctx.lineTo(stroke[0].x + 0.1, stroke[0].y);
      ctx.stroke();
    }
  }, []);

  // Keep the canvas sharp at the screen's pixel density and redraw after a resize.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const oldW = canvas.width || 1;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      const k = canvas.width / oldW;
      if (oldW > 1 && k !== 1) strokes.current = strokes.current.map((s) => s.map((p) => ({ x: p.x * k, y: p.y * k })));
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [redraw]);

  const changed = () => {
    setEmpty(!strokes.current.length && !uploaded.current);
    setData("");
  };

  const pos = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = e.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
  };

  const onDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    strokes.current.push([pos(e)]);
    redraw();
  };
  const onMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    strokes.current[strokes.current.length - 1].push(pos(e));
    redraw();
  };
  const onUp = () => {
    if (!drawing.current) return;
    drawing.current = false;
    changed();
  };

  const clear = () => {
    strokes.current = [];
    uploaded.current = null;
    setUploadError("");
    redraw();
    changed();
  };
  const undo = () => {
    if (strokes.current.length) strokes.current.pop();
    else uploaded.current = null;
    redraw();
    changed();
  };

  const onUpload = (file: File | undefined) => {
    setUploadError("");
    if (!file) return;
    if (!file.type.startsWith("image/")) return setUploadError("Choose a photo or picture file (PNG or JPG).");
    if (file.size > 8 * 1024 * 1024) return setUploadError("That picture is too big. Choose one under 8 MB.");
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      uploaded.current = img;
      strokes.current = [];
      redraw();
      changed();
      URL.revokeObjectURL(url);
    };
    img.onerror = () => setUploadError("That picture couldn't be opened. Try a PNG or JPG.");
    img.src = url;
  };

  // Crop to the ink (plus a little margin) and shrink to a sensible size before saving.
  const exportPng = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return "";
    const { width, height } = canvas;
    const px = ctx.getImageData(0, 0, width, height).data;
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (px[(y * width + x) * 4 + 3] > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return "";
    const pad = Math.round(Math.max(width, height) * 0.02);
    minX = Math.max(0, minX - pad);
    minY = Math.max(0, minY - pad);
    maxX = Math.min(width - 1, maxX + pad);
    maxY = Math.min(height - 1, maxY + pad);
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const k = Math.min(1, MAX_WIDTH / w);
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(w * k));
    out.height = Math.max(1, Math.round(h * k));
    out.getContext("2d")?.drawImage(canvas, minX, minY, w, h, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  };

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const png = exportPng();
        if (!png) {
          e.preventDefault();
          return;
        }
        const input = e.currentTarget.elements.namedItem("signature") as HTMLInputElement | null;
        if (input) input.value = png;
        setData(png);
      }}
      className="space-y-4"
    >
      <div>
        <div className="flex items-center justify-between gap-3">
          <span className="gf-label !mb-0" id="signature-pad-label">
            Sign in the box
          </span>
          <span className="text-xs text-slate-500">Use your finger, a stylus or the mouse</span>
        </div>
        <div className="relative mt-1.5 overflow-hidden rounded-xl border-2 border-dashed border-slate-300 bg-white focus-within:border-brand-green-400">
          <canvas
            ref={canvasRef}
            className="block aspect-[3/1] w-full cursor-crosshair touch-none"
            aria-labelledby="signature-pad-label"
            role="img"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          />
          <div className="pointer-events-none absolute inset-x-[8%] bottom-[24%] border-b border-slate-300" aria-hidden="true" />
          {empty ? (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-slate-400" aria-hidden="true">
              Sign here
            </div>
          ) : null}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={undo} disabled={empty} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Undo
          </button>
          <button type="button" onClick={clear} disabled={empty} className={buttonClasses({ variant: "secondary", size: "sm" })}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Clear
          </button>
          <label className={buttonClasses({ variant: "ghost", size: "sm", className: "cursor-pointer" })}>
            <ImageUp className="h-4 w-4" aria-hidden="true" />
            Upload a photo instead
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onUpload(e.target.files?.[0])} />
          </label>
        </div>
        {uploadError ? <p className="mt-1.5 text-sm text-red-700">{uploadError}</p> : null}
        <p className="gf-hint mt-1.5">A photo works best on plain white paper with dark ink. The paper is removed automatically.</p>
      </div>

      <div>
        <label htmlFor="signed_name" className="gf-label">
          Name printed under your signature
        </label>
        <input id="signed_name" name="signed_name" className="gf-input" defaultValue={defaultName} required minLength={2} maxLength={80} placeholder="e.g. Mrs A. Bello" />
      </div>

      <input type="hidden" name="signature" defaultValue={data} />
      <SubmitButton disabled={empty}>Save signature</SubmitButton>
    </form>
  );
}
