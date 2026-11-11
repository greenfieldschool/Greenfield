import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";

// Saves or removes this phone's address for phone notifications, for the signed-in parent or pupil.
// POST { endpoint, keys: { p256dh, auth }, oldEndpoint? }  (oldEndpoint: the phone renewed its address)
// DELETE { endpoint }
// The database checks who is signed in (push_subscribe / RLS), so nobody can save a phone for someone else.
export const dynamic = "force-dynamic";

type Body = { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown }; oldEndpoint?: unknown };

const str = (v: unknown, max: number) => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const isPushAddress = (v: string | null) => Boolean(v && v.startsWith("https://"));

async function readBody(request: NextRequest): Promise<Body | null> {
  try {
    return (await request.json()) as Body;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

  const body = await readBody(request);
  const endpoint = str(body?.endpoint, 1000);
  const p256dh = str(body?.keys?.p256dh, 200);
  const auth = str(body?.keys?.auth, 100);
  const oldEndpoint = str(body?.oldEndpoint, 1000);
  if (!isPushAddress(endpoint) || !p256dh || !auth) {
    return NextResponse.json({ error: "This phone's details weren't complete." }, { status: 400 });
  }

  const { error } = await supabase.rpc("push_subscribe", {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: (request.headers.get("user-agent") ?? "").slice(0, 400) || null,
    p_old_endpoint: isPushAddress(oldEndpoint) ? oldEndpoint : null
  });
  if (error) return NextResponse.json({ error: "Couldn't save. Please try again later." }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = getSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Not available" }, { status: 503 });
  const body = await readBody(request);
  const endpoint = str(body?.endpoint, 1000);
  if (!endpoint) return NextResponse.json({ error: "Missing phone details." }, { status: 400 });
  // Only the person's own row can be deleted (RLS); a signed-out request deletes nothing.
  const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) return NextResponse.json({ error: "Couldn't turn off. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
