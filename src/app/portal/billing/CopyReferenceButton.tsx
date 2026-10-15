"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

export default function CopyReferenceButton({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("failed");
      window.setTimeout(() => setStatus("idle"), 2000);
    }
  }

  return (
    <button type="button" onClick={copy} className={buttonClasses({ variant: "secondary", size: "md" })} aria-live="polite">
      {status === "copied" ? (
        <Check className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
      ) : (
        <Copy className="h-4 w-4" aria-hidden="true" />
      )}
      {status === "copied" ? "Copied" : status === "failed" ? "Copy failed" : "Copy reference"}
    </button>
  );
}
