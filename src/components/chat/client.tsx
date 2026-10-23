"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Flag, MoreHorizontal, SendHorizontal, Trash2, Undo2 } from "lucide-react";
import { removeMessage, reportMessage, sendMessage, unsendMessage } from "@/lib/chat-actions";
import { MESSAGE_MAX } from "@/lib/chat";
import { cn } from "@/lib/cn";

// Keeps an open conversation fresh without a websocket: re-renders every few seconds while the tab is visible,
// and right away when the tab comes back into focus.
export function LiveRefresh({ intervalMs = 7000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const id = window.setInterval(tick, intervalMs);
    const onFocus = () => router.refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [router, intervalMs]);
  return null;
}

// Scroll container that starts at the newest message and follows new ones, unless the reader has scrolled up.
export function MessageScroller({ children, count, className }: { children: ReactNode; count: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [count]);
  return (
    <div
      ref={ref}
      onScroll={(e) => {
        const el = e.currentTarget;
        pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      }}
      className={className}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {children}
    </div>
  );
}

export function Composer({ conversationId, placeholder }: { conversationId: string; placeholder: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const area = useRef<HTMLTextAreaElement>(null);

  // Grow with the text up to ~6 lines.
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    if (!text) {
      el.style.height = "";
      return;
    }
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const submit = () => {
    const body = text.trim();
    if (!body || pending) return;
    setError(null);
    start(async () => {
      const res = await sendMessage(conversationId, body);
      if (res.ok) {
        setText("");
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  };

  const remaining = MESSAGE_MAX - text.length;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border-t border-slate-200 bg-white px-3 py-3 sm:px-4"
    >
      {error ? (
        <p role="alert" className="mb-2 rounded-lg bg-red-50 px-3 py-1.5 text-xs text-red-800">
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <label htmlFor={`composer-${conversationId}`} className="sr-only">
          Message
        </label>
        <textarea
          id={`composer-${conversationId}`}
          ref={area}
          rows={1}
          value={text}
          maxLength={MESSAGE_MAX}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder={placeholder}
          className="max-h-40 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-[15px] text-slate-900 outline-none transition focus:border-brand-green-500 focus:bg-white focus:ring-4 focus:ring-brand-green-500/15"
        />
        <button
          type="submit"
          disabled={!text.trim() || pending}
          aria-label="Send message"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-green text-white shadow-sm transition hover:bg-brand-green-700 disabled:opacity-40"
        >
          <SendHorizontal className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="mt-1 flex justify-between px-1 text-[11px] text-slate-400">
        <span className="hidden sm:inline">Enter to send · Shift + Enter for a new line</span>
        {remaining < 200 ? <span className={cn(remaining < 50 && "text-brand-gold-800")}>{remaining} left</span> : <span />}
      </div>
    </form>
  );
}

// Small per-message menu: unsend (own, within 15 min), report (others), remove (moderators).
export function MessageMenu({
  messageId,
  canUnsend,
  canReport,
  canRemove,
  align
}: {
  messageId: string;
  canUnsend: boolean;
  canReport: boolean;
  canRemove: boolean;
  align: "left" | "right";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"menu" | "report" | "remove">("menu");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!canUnsend && !canReport && !canRemove) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      const res = await fn();
      setNote(res.ok ? done : (res as { error: string }).error);
      if (res.ok) {
        setMode("menu");
        setReason("");
        router.refresh();
      }
    });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setMode("menu");
          setNote(null);
        }}
        aria-label="Message options"
        aria-expanded={open}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 opacity-60 transition hover:bg-slate-100 hover:text-slate-700 group-hover:opacity-100 focus:opacity-100"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className={cn(
            "absolute top-8 z-20 w-64 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg",
            align === "right" ? "right-0" : "left-0"
          )}
        >
          {note ? <p className="mb-2 rounded-lg bg-slate-50 px-2 py-1.5 text-xs text-slate-700">{note}</p> : null}
          {mode === "menu" ? (
            <div className="flex flex-col">
              {canUnsend ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => unsendMessage(messageId), "Message unsent")}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                >
                  <Undo2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Unsend
                </button>
              ) : null}
              {canReport ? (
                <button type="button" onClick={() => setMode("report")} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50">
                  <Flag className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Report to the school
                </button>
              ) : null}
              {canRemove ? (
                <button type="button" onClick={() => setMode("remove")} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-red-700 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                  Remove message
                </button>
              ) : null}
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (mode === "report") run(() => reportMessage(messageId, reason), "Reported. The school will look at it.");
                else run(() => removeMessage(messageId, reason), "Message removed");
              }}
              className="space-y-2"
            >
              <label className="block text-xs font-semibold text-slate-600" htmlFor={`reason-${messageId}`}>
                {mode === "report" ? "What's wrong with this message?" : "Reason for removing (kept on record)"}
              </label>
              <textarea
                id={`reason-${messageId}`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                maxLength={500}
                required
                className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-brand-green-500"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setMode("menu")} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  Back
                </button>
                <button
                  type="submit"
                  disabled={pending || reason.trim().length < 3}
                  className="rounded-lg bg-brand-green px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {mode === "report" ? "Send report" : "Remove"}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
