"use server";

import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { cleanMeetingUrl, onlineClassErrorMessage } from "@/lib/online-classes";

// Join: records attendance (join_online_class checks it's the pupil or their parent, the right class, not cancelled,
// and open now) and sends them on to the meeting.
export async function joinOnlineClass(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const studentId = String(formData.get("student_id") ?? "").trim();
  const backTo = String(formData.get("back") ?? "/portal/online-classes");
  const safeBack = backTo.startsWith("/portal/online-classes") ? backTo : "/portal/online-classes";
  const fail = (message: string): never => {
    const sep = safeBack.includes("?") ? "&" : "?";
    redirect(`${safeBack}${sep}toast=${encodeURIComponent(message)}&toast_type=error`);
  };
  const supabase = getSupabaseServerClient();
  if (!supabase || !id || !studentId) fail("Couldn't join. Please try again.");
  const { data, error } = await supabase!.rpc("join_online_class", { p_class: id, p_student: studentId });
  if (error) fail(onlineClassErrorMessage(error.message));
  const url = cleanMeetingUrl(String(data ?? ""));
  if (!url) fail("The meeting link isn't working. Ask the teacher for a new one.");
  redirect(url as string);
}
