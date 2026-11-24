import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// The exam page checks in: every 15 seconds, when it is hidden or loses focus ("away"), and when it comes back
// ("back", with how long the browser says it was hidden). The database decides about locking and time
// (exam_checkin in docs/migrations/20261124_exam_lockouts_and_time.sql).
export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 500 });

  const body = (await request.json().catch(() => null)) as { attemptId?: string; event?: string; hiddenSeconds?: number } | null;
  const attemptId = String(body?.attemptId ?? "").trim();
  const event = String(body?.event ?? "");
  if (!attemptId || !["heartbeat", "away", "back"].includes(event)) return NextResponse.json({ ok: false }, { status: 400 });
  const hidden = Number(body?.hiddenSeconds);

  const { data, error } = await supabase.rpc("exam_checkin", {
    p_attempt: attemptId,
    p_event: event,
    p_hidden_seconds: Number.isFinite(hidden) ? Math.max(0, Math.round(hidden)) : null
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  const row = (Array.isArray(data) ? data[0] : data) as { seconds_left: number | null; locked: boolean; submitted: boolean } | null;
  return NextResponse.json({ ok: true, secondsLeft: row?.seconds_left ?? null, locked: !!row?.locked, submitted: !!row?.submitted });
}
