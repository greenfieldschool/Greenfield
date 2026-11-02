"use client";

import { motion, useReducedMotion, type Variants } from "framer-motion";
import type { ReactNode } from "react";

// Content that animates in as it scrolls into view (once). Respects reduced motion.

const EASE = [0.2, 0.7, 0.2, 1] as const;

export type RevealVariant = "up" | "fade" | "scale" | "left" | "right" | "mask";

const hidden: Record<RevealVariant, Record<string, number | string>> = {
  up: { opacity: 0, y: 28 },
  fade: { opacity: 0 },
  scale: { opacity: 0, scale: 0.94, y: 16 },
  left: { opacity: 0, x: -32 },
  right: { opacity: 0, x: 32 },
  // A picture wipes in from the bottom while settling from a slight zoom.
  mask: { clipPath: "inset(100% 0% 0% 0% round 24px)", scale: 1.08 }
};
const shown: Record<RevealVariant, Record<string, number | string>> = {
  up: { opacity: 1, y: 0 },
  fade: { opacity: 1 },
  scale: { opacity: 1, scale: 1, y: 0 },
  left: { opacity: 1, x: 0 },
  right: { opacity: 1, x: 0 },
  mask: { clipPath: "inset(0% 0% 0% 0% round 24px)", scale: 1 }
};

type As = "div" | "li" | "section" | "ol" | "ul";

export function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
  variant = "up"
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: As;
  variant?: RevealVariant;
}) {
  const reduced = useReducedMotion();
  const Comp = motion[as];
  if (reduced) return <Comp className={className}>{children}</Comp>;
  if (variant === "mask") {
    // The browser counts a fully clipped element as off screen, so the outer box is watched and the inner one wipes.
    const wipe: Variants = {
      hidden: hidden.mask,
      shown: { ...shown.mask, transition: { duration: 1.1, delay, ease: EASE } }
    };
    return (
      <Comp className={className} initial="hidden" whileInView="shown" viewport={{ once: true, margin: "-60px" }}>
        <motion.div className="relative h-full w-full" variants={wipe}>
          {children}
        </motion.div>
      </Comp>
    );
  }
  return (
    <Comp
      className={className}
      initial={hidden[variant]}
      whileInView={shown[variant]}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </Comp>
  );
}

/**
 * A group whose children (`StaggerItem`) come in one after another when the group scrolls into view: cards, list
 * rows, photo tiles. `gap` is the time between items, in seconds.
 */
export function Stagger({
  children,
  className,
  as = "div",
  gap = 0.09,
  delay = 0
}: {
  children: ReactNode;
  className?: string;
  as?: As;
  gap?: number;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const Comp = motion[as];
  if (reduced) return <Comp className={className}>{children}</Comp>;
  const container: Variants = { hidden: {}, shown: { transition: { staggerChildren: gap, delayChildren: delay } } };
  return (
    <Comp className={className} variants={container} initial="hidden" whileInView="shown" viewport={{ once: true, margin: "-60px" }}>
      {children}
    </Comp>
  );
}

export function StaggerItem({
  children,
  className,
  as = "div",
  variant = "up"
}: {
  children: ReactNode;
  className?: string;
  as?: As;
  variant?: RevealVariant;
}) {
  const reduced = useReducedMotion();
  const Comp = motion[as];
  if (reduced) return <Comp className={className}>{children}</Comp>;
  const item: Variants = {
    hidden: hidden[variant],
    shown: { ...shown[variant], transition: { duration: variant === "mask" ? 1 : 0.65, ease: EASE } }
  };
  return (
    <Comp className={className} variants={item}>
      {children}
    </Comp>
  );
}
