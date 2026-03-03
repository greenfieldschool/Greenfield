"use client";

import { useEffect } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

export default function PortalDebugLogger({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;

    const supabaseClient = getSupabaseBrowserClient();
    if (!supabaseClient) {
      // eslint-disable-next-line no-console
      console.error("[portal-debug] Supabase browser client not configured (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)");
      return;
    }

    const supabase = supabaseClient;

    let cancelled = false;

    async function run() {
      const startedAt = new Date().toISOString();

      // eslint-disable-next-line no-console
      console.groupCollapsed(`[portal-debug] ${startedAt} exams page`);

      try {
        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (cancelled) return;

        // eslint-disable-next-line no-console
        console.log("auth.getUser", { user: userData?.user ?? null, error: userError ?? null });

        const user = userData?.user ?? null;
        if (!user) {
          // eslint-disable-next-line no-console
          console.warn("[portal-debug] No auth user in browser session");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, role")
          .eq("id", user.id)
          .maybeSingle();

        if (cancelled) return;

        // eslint-disable-next-line no-console
        console.log("profiles", { profile: profile ?? null, error: profileError ?? null });

        const role = (profile as { role?: string } | null)?.role ?? null;
        if (role !== "student") {
          // eslint-disable-next-line no-console
          console.warn("[portal-debug] Role is not student", { role });
          return;
        }

        const { data: link, error: linkError } = await supabase
          .from("student_user_links")
          .select("user_id, student_id")
          .eq("user_id", user.id)
          .maybeSingle();

        if (cancelled) return;

        // eslint-disable-next-line no-console
        console.log("student_user_links", { link: link ?? null, error: linkError ?? null });

        const studentId = (link as { student_id?: string } | null)?.student_id ?? null;
        if (!studentId) {
          // eslint-disable-next-line no-console
          console.warn("[portal-debug] No student_id linked for this auth user", { user_id: user.id });
          return;
        }

        const { data: student, error: studentError } = await supabase
          .from("students")
          .select("id, admission_number, class_id")
          .eq("id", studentId)
          .maybeSingle();

        if (cancelled) return;

        const classId = (student as { class_id?: string | null } | null)?.class_id ?? null;
        const { data: cls, error: clsError } = classId
          ? await supabase.from("classes").select("id, level, name").eq("id", classId).maybeSingle()
          : { data: null, error: null };

        // eslint-disable-next-line no-console
        console.log("students", {
          student: student ?? null,
          error: studentError ?? null,
          class: cls ?? null,
          classError: clsError ?? null
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error("[portal-debug] Unexpected error", e);
      } finally {
        // eslint-disable-next-line no-console
        console.groupEnd();
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return null;
}
