"use client";

/**
 * UrlToast — reads `?toast=<message>&toast_type=success|error|info` from the URL
 * and fires a toast via the global ToastProvider.
 *
 * Usage: Add <UrlToast /> anywhere on a page that uses redirect(url + "?toast=...") for feedback.
 * It reacts to every new `?toast` value — including a server action redirecting back to the same
 * page, which does not remount this component — then clears the params from the URL bar.
 */

import { useEffect, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useOptionalToast, type ToastType } from "./toast-provider";

export default function UrlToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // Outside a ToastProvider (e.g. a page shown while signed out) there is nowhere to show it: do nothing.
  const showToast = useOptionalToast()?.showToast;
  const lastShown = useRef<string | null>(null);

  const message = searchParams.get("toast");
  const typeRaw = searchParams.get("toast_type") ?? "success";

  useEffect(() => {
    if (!message) {
      // Params were cleared; allow the same message to show again after the next redirect.
      lastShown.current = null;
      return;
    }
    const key = `${typeRaw}:${message}`;
    // Guards against double-firing (React strict mode) before the URL is cleaned.
    if (lastShown.current === key) return;
    lastShown.current = key;

    const type: ToastType = typeRaw === "error" ? "error" : typeRaw === "info" ? "info" : "success";
    showToast?.(message, type);

    // Clean the query params from the URL without a full navigation
    const next = new URLSearchParams(searchParams.toString());
    next.delete("toast");
    next.delete("toast_type");
    const qs = next.toString();
    router.replace(pathname + (qs ? `?${qs}` : ""), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, typeRaw]);

  return null;
}
