import { NextResponse, type NextRequest } from "next/server";
import { readUnsubscribe, unsubscribe } from "@/lib/email/preferences";

// Mail apps' own "Unsubscribe" button (List-Unsubscribe-Post, one click). Opening it in a browser shows the page.
export async function POST(request: NextRequest) {
  const q = request.nextUrl.searchParams;
  const who = readUnsubscribe({ u: q.get("u"), c: q.get("c"), s: q.get("s") });
  if (!who) return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  const ok = await unsubscribe(who.userId, who.category);
  return NextResponse.json({ ok }, { status: ok ? 200 : 500 });
}

export async function GET(request: NextRequest) {
  const url = new URL("/email/unsubscribe", request.url);
  url.search = request.nextUrl.search;
  return NextResponse.redirect(url);
}
