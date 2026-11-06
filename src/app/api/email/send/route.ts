import { NextResponse, type NextRequest } from "next/server";
import { runOutbox } from "@/lib/email/outbox";

// The scheduled sending job: Supabase (pg_cron, every 5 minutes) and Vercel Cron (daily backup) call this with
// "Authorization: Bearer <CRON_SECRET>". Sends what's waiting, within Gmail's daily limit.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const result = await runOutbox(40);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
