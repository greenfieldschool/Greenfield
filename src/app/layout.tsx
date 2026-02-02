import type { Metadata } from "next";
import "./globals.css";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Greenfield School",
  description: "Greenfield School — Excellence in learning, character, and community."
};

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </div>

        <a
          href="https://wa.me/2349060010300"
          target="_blank"
          rel="noreferrer"
          aria-label="Chat with Greenfield School on WhatsApp"
          className="fixed bottom-6 right-6 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-white shadow-lg transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
        >
          <svg
            viewBox="0 0 32 32"
            width="26"
            height="26"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M19.11 17.93c-.26-.13-1.5-.74-1.73-.82-.23-.09-.4-.13-.57.13-.17.26-.66.82-.81.99-.15.17-.3.2-.56.07-.26-.13-1.09-.4-2.08-1.27-.77-.69-1.28-1.54-1.43-1.8-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.45.13-.15.17-.26.26-.43.09-.17.04-.33-.02-.46-.06-.13-.57-1.38-.78-1.89-.21-.5-.42-.43-.57-.44h-.49c-.17 0-.45.06-.68.33-.23.26-.9.88-.9 2.14 0 1.26.92 2.48 1.05 2.66.13.17 1.81 2.77 4.38 3.88.61.26 1.08.42 1.45.54.61.19 1.17.16 1.61.1.49-.07 1.5-.61 1.71-1.2.21-.59.21-1.1.15-1.2-.06-.1-.23-.16-.49-.29z" />
            <path d="M16 3C8.83 3 3 8.67 3 15.65c0 2.44.7 4.83 2.02 6.89L3 29l6.64-1.96c1.99 1.07 4.23 1.63 6.53 1.63 7.17 0 13-5.67 13-12.65S23.17 3 16 3zm0 22.6c-2.14 0-4.22-.57-6.02-1.66l-.43-.26-3.94 1.17 1.18-3.77-.28-.42c-1.19-1.78-1.82-3.85-1.82-6.01C4.69 9.9 9.75 5 16 5s11.31 4.9 11.31 10.65S22.25 25.6 16 25.6z" />
          </svg>
        </a>
      </body>
    </html>
  );
}
