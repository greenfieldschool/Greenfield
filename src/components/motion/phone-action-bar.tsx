"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { CalendarCheck } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { cn } from "@/lib/cn";

// Pages that already are the action, so the bar would only get in the way.
const HIDE_ON = ["/apply", "/contact"];

/**
 * Phones: "Book a visit" and "Apply" within thumb reach. It slides up once the visitor has scrolled past the first
 * screen, and slides away again near the bottom of the page, where the enquiry form and footer already offer the
 * same. It sets --gf-cta so the WhatsApp button moves up out of its way. Not shown from 1024px up.
 */
export function PhoneActionBar() {
  const pathname = usePathname() ?? "/";
  const [shown, setShown] = useState(false);
  const hiddenHere = HIDE_ON.some((p) => pathname === p || pathname.startsWith(p + "/"));

  useEffect(() => {
    if (hiddenHere) return setShown(false);
    const media = window.matchMedia("(max-width: 1023px)");
    const update = () => {
      const y = window.scrollY;
      const nearEnd = y + window.innerHeight > document.documentElement.scrollHeight - 900;
      setShown(media.matches && y > window.innerHeight * 0.9 && !nearEnd);
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    media.addEventListener("change", update);
    return () => {
      window.removeEventListener("scroll", update);
      media.removeEventListener("change", update);
    };
  }, [hiddenHere, pathname]);

  useEffect(() => {
    document.documentElement.style.setProperty("--gf-cta", shown ? "4.75rem" : "0px");
    return () => document.documentElement.style.setProperty("--gf-cta", "0px");
  }, [shown]);

  if (hiddenHere) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none lg:hidden",
        shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-[140%] opacity-0"
      )}
      aria-hidden={!shown}
    >
      <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-brand-green-950/90 p-2 shadow-2xl shadow-black/30 backdrop-blur-md">
        <Link href="/apply" tabIndex={shown ? 0 : -1} className={buttonClasses({ variant: "inverse", size: "lg", className: "flex-1" })}>
          Apply
        </Link>
        <Link href="/contact" tabIndex={shown ? 0 : -1} className={buttonClasses({ variant: "gold", size: "lg", className: "flex-[1.4]" })}>
          <CalendarCheck className="h-4 w-4" aria-hidden="true" />
          Book a visit
        </Link>
      </div>
    </div>
  );
}
