import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { saveFinishedPacks } from "@/lib/mi-history";

// Nightly job (Vercel Cron, 00:30 Lagos time): saves the management pack for the week and the month that have just
// finished, if they aren't saved yet. Called with "Authorization: Bearer <CRON_SECRET>", like /api/email/send.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const service = getSupabaseServiceClient();
  if (!service) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  const results = await saveFinishedPacks(service);
  return NextResponse.json({ results });
}

export const GET = handle;
export const POST = handle;
