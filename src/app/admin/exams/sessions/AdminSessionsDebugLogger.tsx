"use client";

import { useEffect } from "react";

export default function AdminSessionsDebugLogger({
  enabled,
  loadErrorMsg,
  sessions
}: {
  enabled: boolean;
  loadErrorMsg: string | null;
  sessions: Array<{
    id: string;
    test_id: string;
    class_id: string | null;
    starts_at: string | null;
    ends_at: string | null;
    status: string;
    active: boolean;
  }>;
}) {
  useEffect(() => {
    if (!enabled) return;
    const ts = new Date().toISOString();
    // eslint-disable-next-line no-console
    console.log("[admin-debug]", ts, "admin sessions page");
    // eslint-disable-next-line no-console
    console.log("loadErrorMsg", loadErrorMsg);
    // eslint-disable-next-line no-console
    console.log("sessions.length", sessions?.length ?? 0);
    // eslint-disable-next-line no-console
    console.log(
      "sessions.sample",
      (sessions ?? []).slice(0, 5).map((s) => ({
        id: s.id,
        status: s.status,
        active: s.active,
        starts_at: s.starts_at,
        ends_at: s.ends_at,
        class_id: s.class_id,
        test_id: s.test_id
      }))
    );
  }, [enabled, loadErrorMsg, sessions]);

  return null;
}
