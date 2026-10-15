"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// Fades and lifts content in as it scrolls into view (once). Respects reduced motion.
export function Reveal({
  children,
  delay = 0,
  className,
  as = "div"
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "li" | "section";
}) {
  const reduced = useReducedMotion();
  const Comp = motion[as];
  if (reduced) return <Comp className={className}>{children}</Comp>;
  return (
    <Comp
      className={className}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
      {children}
    </Comp>
  );
}
