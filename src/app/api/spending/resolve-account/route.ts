import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { PaystackError, paystackConfigured, resolveAccount } from "@/lib/paystack";

// Signed-in staff check the name the bank holds for an account before asking for money. The server checks it again
// when the request is saved, so this is only a convenience for the form.
export async function GET(req: Request) {
  const supabase = getSupabaseServerClient();
  if (!supabase || !paystackConfigured()) return NextResponse.json({ error: "Name checks aren't available yet." }, { status: 503 });
  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const { data: isStaff } = await supabase.rpc("is_staff");
  if (!isStaff) return NextResponse.json({ error: "Staff only." }, { status: 403 });

  const url = new URL(req.url);
  const account = (url.searchParams.get("account") ?? "").replace(/\D/g, "");
  const bank = (url.searchParams.get("bank") ?? "").trim();
  if (!/^\d{10}$/.test(account) || !/^[0-9A-Za-z]{2,12}$/.test(bank)) {
    return NextResponse.json({ error: "Choose the bank and type the 10-digit account number." }, { status: 400 });
  }
  try {
    return NextResponse.json({ name: await resolveAccount(account, bank) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof PaystackError ? e.message : "Couldn't check the name just now." }, { status: 200 });
  }
}
