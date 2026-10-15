import { notFound } from "next/navigation";
import type { ReactNode } from "react";

// Temporary design preview with sample data, for reviewing the redesign without a login.
// Never served in production; delete this folder once the redesign is signed off.
export default function DesignPreviewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return children;
}
