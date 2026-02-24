"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.position = "absolute";
        el.style.left = "-9999px";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      } catch {
        // ignore
      }
    }
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={
        "inline-flex items-center justify-center rounded-xl border px-4 py-2 text-sm font-semibold transition " +
        (copied
          ? "border-emerald-300 bg-emerald-50 text-emerald-900"
          : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50")
      }
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
