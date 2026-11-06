import { redirect } from "next/navigation";
import Link from "next/link";
import { MailX } from "lucide-react";
import { CATEGORY_LABEL, readUnsubscribe, unsubscribe } from "@/lib/email/preferences";
import { Logo } from "@/components/ui/logo";
import { buttonClasses } from "@/components/ui/button";

// "Stop these emails" from the bottom of a school email. Works without signing in (the link is signed for that
// person and kind of email), and asks to confirm so a mail scanner opening the link doesn't unsubscribe anyone.

export const metadata = { title: "Email settings · Greenfield School", robots: { index: false } };

async function confirmStop(formData: FormData) {
  "use server";
  const params = { u: String(formData.get("u") ?? ""), c: String(formData.get("c") ?? ""), s: String(formData.get("s") ?? "") };
  const who = readUnsubscribe(params);
  if (!who) redirect("/email/unsubscribe?bad=1");
  const ok = await unsubscribe(who.userId, who.category);
  redirect(`/email/unsubscribe?${new URLSearchParams({ ...params, done: ok ? "1" : "0" }).toString()}`);
}

export default async function UnsubscribePage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = (await searchParams) ?? {};
  const get = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : (sp[k] as string | undefined)) ?? "";
  const who = readUnsubscribe({ u: get("u"), c: get("c"), s: get("s") });
  const done = get("done");

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
        <Logo subtitle="Email settings" />
        <div className="mt-6 flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-green-50 text-brand-green-700">
            <MailX className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            {!who ? (
              <>
                <h1 className="text-lg font-semibold text-slate-900">This link isn&apos;t working</h1>
                <p className="mt-1 text-sm text-slate-600">
                  It may have been copied only in part. You can choose which emails you get on the portal, under Notifications.
                </p>
              </>
            ) : done === "1" ? (
              <>
                <h1 className="text-lg font-semibold text-slate-900">Done</h1>
                <p className="mt-1 text-sm text-slate-600">
                  You won&apos;t get {CATEGORY_LABEL[who.category]} any more. You&apos;ll still see everything on the portal, and you can turn them back on there
                  under Notifications.
                </p>
              </>
            ) : done === "0" ? (
              <>
                <h1 className="text-lg font-semibold text-slate-900">That didn&apos;t work</h1>
                <p className="mt-1 text-sm text-slate-600">Please try again in a moment, or switch the emails off on the portal under Notifications.</p>
              </>
            ) : (
              <>
                <h1 className="text-lg font-semibold text-slate-900">Stop these emails?</h1>
                <p className="mt-1 text-sm text-slate-600">
                  You&apos;ll stop getting {CATEGORY_LABEL[who.category]} from Greenfield School. Everything still shows on the portal.
                </p>
                <form action={confirmStop} className="mt-4">
                  <input type="hidden" name="u" value={get("u")} />
                  <input type="hidden" name="c" value={get("c")} />
                  <input type="hidden" name="s" value={get("s")} />
                  <button type="submit" className={buttonClasses({ variant: "primary" })}>
                    Stop these emails
                  </button>
                </form>
              </>
            )}
            <Link href="/portal/notifications" className="mt-4 inline-block text-sm font-semibold text-brand-green-700 hover:underline">
              Open the portal
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
