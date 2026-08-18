"use client";

import React, { createContext, useCallback, useContext, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toasts: Toast[];
  showToast: (message: string, type?: ToastType) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "success") => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { id, message, type }]);

      // Auto-dismiss after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4000);
    },
    []
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, dismissToast }}>
      {children}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

// ---- Toast Container (portal into bottom-right) ----
function ToastContainer({
  toasts,
  onDismiss
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex flex-col gap-3"
      style={{ minWidth: 280, maxWidth: 380 }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  const isSuccess = toast.type === "success";
  const isError = toast.type === "error";

  return (
    <div
      role="alert"
      className={[
        "pointer-events-auto flex items-start gap-3 rounded-2xl px-4 py-3 shadow-lg",
        "animate-toast-in border",
        isSuccess && "border-emerald-200 bg-emerald-50 text-emerald-900",
        isError && "border-red-200 bg-red-50 text-red-900",
        !isSuccess && !isError && "border-slate-200 bg-white text-slate-900"
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* Icon */}
      <span className="mt-0.5 shrink-0 text-lg leading-none" aria-hidden>
        {isSuccess ? "✓" : isError ? "✕" : "ℹ"}
      </span>

      {/* Message */}
      <span className="flex-1 text-sm font-medium leading-snug">{toast.message}</span>

      {/* Dismiss */}
      <button
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className={[
          "shrink-0 rounded-lg p-0.5 text-sm opacity-60 transition-opacity hover:opacity-100",
          isSuccess && "text-emerald-700",
          isError && "text-red-700",
          !isSuccess && !isError && "text-slate-600"
        ]
          .filter(Boolean)
          .join(" ")}
      >
        ✕
      </button>
    </div>
  );
}
