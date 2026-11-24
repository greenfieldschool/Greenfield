import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 500 });

  const body = (await request.json().catch(() => null)) as
    | { attemptId?: string; reason?: string; eventData?: Record<string, unknown> }
    | null;

  const attemptId = String(body?.attemptId ?? "").trim();
  const reason = String(body?.reason ?? "focus_loss").trim() || "focus_loss";

  if (!attemptId) return NextResponse.json({ ok: false }, { status: 400 });

  // Older exam pages call this on any loss of focus. It now counts as "away": the exam locks only after 10 seconds.
  void reason;
  const { error } = await supabase.rpc("exam_checkin", { p_attempt: attemptId, p_event: "away", p_hidden_seconds: null });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
