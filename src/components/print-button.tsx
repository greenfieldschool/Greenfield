"use client";

import { Printer } from "lucide-react";
import { buttonClasses, type ButtonVariant } from "@/components/ui/button";

export default function PrintButton({ label = "Print", variant = "primary" }: { label?: string; variant?: ButtonVariant }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClasses({ variant })}>
      <Printer className="h-4 w-4" aria-hidden="true" />
      {label}
    </button>
  );
}
