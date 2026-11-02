import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { SmoothScroll } from "@/components/motion/smooth-scroll";
import { CustomCursor } from "@/components/motion/cursor";
import { IntroCurtain } from "@/components/motion/intro-curtain";
import { PhoneActionBar } from "@/components/motion/phone-action-bar";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Outside the page template: its arrival animation would otherwise pin the curtain to the page, not the screen. */}
      <IntroCurtain />
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
      <PhoneActionBar />
      <WhatsAppButton />
      <SmoothScroll />
      <CustomCursor />
    </div>
  );
}
