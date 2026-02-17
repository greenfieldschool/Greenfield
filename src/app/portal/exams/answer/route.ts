import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ ok: false }, { status: 500 });

  const body = (await request.json().catch(() => null)) as
    | { attemptId?: string; questionId?: string; answer?: unknown }
    | null;

  const attemptId = String(body?.attemptId ?? "").trim();
  const questionId = String(body?.questionId ?? "").trim();

  if (!attemptId || !questionId) return NextResponse.json({ ok: false }, { status: 400 });

  const { error } = await supabase
    .from("exam_attempt_answers")
    .upsert(
      {
        attempt_id: attemptId,
        question_id: questionId,
        answer: body?.answer ?? null
      },
      { onConflict: "attempt_id,question_id" }
    );

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
