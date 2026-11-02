import type { ReactNode } from "react";

// Re-mounts on every page change, so each public page eases in on arrival (CSS only; off for reduced motion).
export default function SiteTemplate({ children }: { children: ReactNode }) {
  return <div className="gf-page-in">{children}</div>;
}
