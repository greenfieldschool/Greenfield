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

  const { error } = await supabase.rpc("lock_exam_attempt", {
    attempt_uuid: attemptId,
    reason,
    event_data: (body?.eventData ?? {}) as unknown
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
