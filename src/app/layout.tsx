import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const sans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap"
});

const display = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz", "SOFT"]
});

export const metadata: Metadata = {
  title: {
    default: "Greenfield School — Creche to Secondary in Lekki, Lagos",
    template: "%s · Greenfield School"
  },
  description:
    "Greenfield School, Lekki — a Nigerian + British blended curriculum from creche to secondary, with strong foundations, high standards and outstanding care."
};

export const viewport: Viewport = {
  themeColor: "#0B3D2E"
};

// Public pages get the site header and footer from app/(site)/layout.tsx; the admin, portal and
// conductor areas bring their own shells.
export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
