"use client";

/**
 * UrlToast — reads `?toast=<message>&toast_type=success|error|info` from the URL
 * on first mount and fires a toast via the global ToastProvider.
 * 
 * Usage: Add <UrlToast /> anywhere on a page that uses redirect(url + "?toast=...") for feedback.
 * The toast fires once on mount, then the params are cleared from the URL bar.
 */

import { useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useToast, type ToastType } from "./toast-provider";

export default function UrlToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { showToast } = useToast();

  useEffect(() => {
    const message = searchParams.get("toast");
    const typeRaw = searchParams.get("toast_type") ?? "success";
    const type: ToastType =
      typeRaw === "error" ? "error" : typeRaw === "info" ? "info" : "success";

    if (!message) return;

    showToast(decodeURIComponent(message), type);

    // Clean the query params from the URL without a full navigation
    const next = new URLSearchParams(searchParams.toString());
    next.delete("toast");
    next.delete("toast_type");
    const qs = next.toString();
    router.replace(pathname + (qs ? `?${qs}` : ""), { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
