import type { ReactNode } from "react";

// Re-mounts on every page change, so each portal page eases in on arrival (CSS only; off for reduced motion).
export default function PortalTemplate({ children }: { children: ReactNode }) {
  return <div className="gf-page-in">{children}</div>;
}
