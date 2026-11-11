import { NextResponse, type NextRequest } from "next/server";
import { runPushOutbox } from "@/lib/push-outbox";

// Sends waiting phone notifications. Called by the database the moment a notification is written (push_kick, via
// pg_net) and by its 5-minute backup job, with "Authorization: Bearer <CRON_SECRET>".
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const result = await runPushOutbox(45000);
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}

export const GET = handle;
export const POST = handle;
