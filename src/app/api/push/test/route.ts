import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { buildPayload, pushConfigured, sendPush, type StoredSubscription } from "@/lib/push";

// "Send a test" on the Notifications page: one alert to this phone, so the parent or pupil can see what they look like.
// POST { endpoint }. Only the signed-in person's own phone is found (RLS).
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase || !pushConfigured()) return NextResponse.json({ error: "Phone notifications aren't set up yet." }, { status: 503 });
  let endpoint: string | null = null;
  try {
    const body = (await request.json()) as { endpoint?: unknown };
    endpoint = typeof body.endpoint === "string" ? body.endpoint : null;
  } catch {
    endpoint = null;
  }
  if (!endpoint) return NextResponse.json({ error: "Missing phone details." }, { status: 400 });

  const { data } = await supabase.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("endpoint", endpoint).maybeSingle();
  const sub = data as StoredSubscription | null;
  if (!sub) return NextResponse.json({ error: "This phone isn't turned on yet. Tap Turn on first." }, { status: 404 });

  const result = await sendPush(
    sub,
    buildPayload({
      title: "Phone notifications are on",
      body: "This is how Greenfield will let you know about new work, marks, lesson notes and online classes.",
      url: "/portal/notifications",
      tag: "test"
    })
  );
  if (result === "gone") {
    await supabase.from("push_subscriptions").delete().eq("id", sub.id);
    return NextResponse.json({ error: "This phone stopped accepting alerts. Tap Turn on again." }, { status: 410 });
  }
  if (result !== "sent") return NextResponse.json({ error: "Couldn't send the test just now. Please try again in a minute." }, { status: 502 });
  return NextResponse.json({ ok: true });
}
