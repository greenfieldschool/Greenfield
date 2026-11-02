import type { ReactNode } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { BookOpen, CalendarCheck, ChevronDown, FileText, Mail, MessagesSquare, Phone, Receipt, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseServiceClient } from "@/lib/supabase/service";
import { school } from "@/lib/school";
import { HELP } from "@/lib/portal-help";
import { WHATSAPP_URL } from "@/components/whatsapp-button";
import { Card } from "@/components/ui/card";
import { PortalPageHeader } from "../_components/portal-ui";
import { HelpOpener } from "./help-opener";

// Help for parents and pupils: short answers, grouped by topic, showing only what applies to the person signed in.
// Each question has an id (lib/portal-help.ts); portal pages link straight to it and it opens on arrival.

type Audience = "parent" | "student";
type Question = { id: string; q: string; a: ReactNode; for?: Audience };
type Topic = { id: string; title: string; icon: LucideIcon; for?: Audience; questions: Question[] };

type IdentityRow = { role: string | null; guardian_id: string | null };

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[13px] font-semibold text-slate-900">{children}</code>;
}

function A({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-brand-green-700 underline-offset-2 hover:underline">
      {children}
    </Link>
  );
}

export default async function PortalHelpPage() {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data: identityRows } = await supabase.rpc("portal_identity");
  const identity = (Array.isArray(identityRows) ? (identityRows[0] ?? null) : null) as unknown as IdentityRow | null;
  const audience: Audience = identity?.role === "student" ? "student" : "parent";

  // The school's payment IDs, and each child's own transfer text, so parents can copy something real.
  let codes: Array<{ name: string; payment_code: string }> = [];
  let children: Array<{ first_name: string; admission_number: string | null }> = [];
  if (audience === "parent") {
    const client = (getSupabaseServiceClient() ?? supabase) as SupabaseClient;
    const [{ data: codeRows, error: codeError }, { data: links }] = await Promise.all([
      client.from("revenue_categories").select("name, payment_code").not("payment_code", "is", null).order("name"),
      identity?.guardian_id
        ? supabase.from("student_guardians").select("student_id").eq("guardian_id", identity.guardian_id)
        : Promise.resolve({ data: [] as Array<{ student_id: string }> })
    ]);
    if (!codeError) codes = (codeRows ?? []) as typeof codes;
    const ids = ((links ?? []) as Array<{ student_id: string }>).map((l) => l.student_id);
    if (ids.length) {
      const { data: kids } = await supabase.from("students").select("first_name, admission_number").in("id", ids).order("first_name");
      children = (kids ?? []) as typeof children;
    }
  }
  const schoolFees = codes.find((c) => /school\s*fee/i.test(c.name))?.payment_code ?? codes[0]?.payment_code ?? "SF";
  const example = children.find((c) => c.admission_number)?.admission_number ?? "GRE/2026/447";

  const topics: Topic[] = [
    {
      id: HELP.fees,
      title: "Fees and paying",
      icon: Receipt,
      for: "parent",
      questions: [
        {
          id: "how-to-pay",
          q: "How do I pay school fees?",
          a: (
            <>
              <p>
                Open <A href="/portal/billing">Fees &amp; billing</A>. Each bill shows what is owed and when it is due. Pay online by tapping{" "}
                <strong>Pay</strong> on the bill, or by bank transfer to the school&apos;s account on your fee notice.
              </p>
            </>
          )
        },
        {
          id: HELP.writeDescription,
          q: "What do I write in the bank transfer description?",
          a: (
            <>
              <p>
                Your child&apos;s admission number, a space, then the payment ID for what you are paying, for example <Code>{`${example} ${schoolFees}`}</Code>. This
                lets the school record your payment automatically.
              </p>
              {children.some((c) => c.admission_number) ? (
                <ul className="mt-2 space-y-1">
                  {children
                    .filter((c) => c.admission_number)
                    .map((c) => (
                      <li key={c.admission_number}>
                        School fees for {c.first_name}: <Code>{`${c.admission_number} ${schoolFees}`}</Code>
                      </li>
                    ))}
                </ul>
              ) : null}
              <p className="mt-2">
                Or copy the exact text shown under each unpaid bill in <A href="/portal/billing">Fees &amp; billing</A> (it uses the bill number, e.g.{" "}
                <Code>{`${example} INV-2026-00012`}</Code>).
              </p>
            </>
          )
        },
        {
          id: "payment-ids",
          q: "What are the payment IDs?",
          a: codes.length ? (
            <>
              <p>A short code for each kind of payment:</p>
              <ul className="mt-2 grid gap-1 sm:grid-cols-2">
                {codes.map((c) => (
                  <li key={c.payment_code} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-1.5">
                    <span>{c.name}</span>
                    <Code>{c.payment_code}</Code>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>A short code for each kind of payment, for example SF for school fees. The codes are on your fee notice, or ask the school office.</p>
          )
        },
        {
          id: HELP.paidNotShowing,
          q: "I have paid, but it still shows that I owe",
          a: (
            <p>
              Bank transfers can take a little while to be recorded. If it has been more than two working days, call the school office on{" "}
              {school.phone} and have your bank receipt ready.
            </p>
          )
        },
        {
          id: "several-children",
          q: "I am paying for more than one child",
          a: <p>Make a separate transfer for each child, each with that child&apos;s admission number, so every payment goes to the right child.</p>
        }
      ]
    },
    {
      id: HELP.reportCards,
      title: "Report cards and certificates",
      icon: BookOpen,
      questions: [
        {
          id: "when-report",
          q: "When can I see the report card?",
          a: (
            <p>
              As soon as the school publishes it, under <A href="/portal/academics">Report card{audience === "parent" ? "s" : ""}</A>. Earlier terms stay there too:
              choose the term at the top.
            </p>
          )
        },
        {
          id: HELP.reportHeld,
          q: "It says the report card is ready, but it won't open",
          a:
            audience === "parent" ? (
              <p>
                Report cards open once the school fees for that term (and any earlier term) are paid. The message shows the amount owed. As soon as the payment is
                recorded the report card opens by itself; there is nothing else to do. See <A href="/portal/billing">Fees &amp; billing</A>.
              </p>
            ) : (
              <p>Your report card opens once your school fees are settled. Please speak to your parent or guardian.</p>
            )
        },
        {
          id: HELP.finalScore,
          q: "How is the final score worked out?",
          a: (
            <>
              <p>
                <strong>Final score = (academic average + welfare) ÷ 2.</strong> The academic average is the average of the subject totals (each out of 100).
                The welfare score is explained below.
              </p>
              <p className="mt-2">The grade comes from the final score. The grading key is printed at the bottom of the report card.</p>
            </>
          )
        },
        {
          id: HELP.welfare,
          q: "What is the welfare score?",
          a: (
            <>
              <p>
                It shows character and conduct, scored every week out of 100: attendance, punctuality, uniform, conduct, politeness, honesty, cooperation,
                attentiveness, leadership and taking part in sports, clubs and crafts. The term&apos;s welfare score is the average of the weeks.
              </p>
              <p className="mt-2">High welfare scores earn a Gold, Silver or Bronze award.</p>
            </>
          )
        },
        {
          id: HELP.certificates,
          q: "Who gets a certificate?",
          a: (
            <p>
              The top three in each class, the best in each subject, and every pupil with a Gold, Silver or Bronze welfare award. If there is one, you&apos;ll see
              &ldquo;View certificates&rdquo; above the report card. Certificates carry the class teacher&apos;s and head teacher&apos;s signatures and can be
              printed or saved.
            </p>
          )
        },
        {
          id: "print",
          q: "How do I print or save a report card?",
          a: <p>Tap &ldquo;Print / save as PDF&rdquo;. On a phone, choose &ldquo;Save as PDF&rdquo; on the print screen to keep a copy.</p>
        }
      ]
    },
    {
      id: "day-to-day",
      title: "Attendance, behaviour and health",
      icon: CalendarCheck,
      questions: [
        {
          id: HELP.attendance,
          q: "What does the attendance page show?",
          a: (
            <p>
              Each school day recorded by the class teacher: present, late, absent or excused. Attendance and being on time both count towards the weekly welfare
              score.{audience === "parent" ? " If your child will be absent, please tell the school." : ""}
            </p>
          )
        },
        {
          id: HELP.behaviour,
          q: "What are discipline records?",
          for: "parent",
          a: (
            <p>
              Behaviour the school has recorded, with how serious it was. Each record takes a few marks off the Conduct part of that week&apos;s welfare score. To
              talk about one, message the class teacher.
            </p>
          )
        },
        {
          id: HELP.health,
          q: "What are health notes?",
          a: <p>Sickness, injuries and other notes recorded at school, such as a visit to the nurse. They never affect any score.</p>
        }
      ]
    },
    {
      id: HELP.messages,
      title: "Messages",
      icon: MessagesSquare,
      for: "parent",
      questions: [
        {
          id: "who-to-message",
          q: "Who can I message?",
          a: (
            <p>
              Your children&apos;s teachers, privately. Each class also has Announcements from its teachers and a Parents&apos; chat (the class teacher can read
              it). You can message another parent only if they have allowed it. Phone numbers and emails are never shown.
            </p>
          )
        },
        {
          id: "reply-times",
          q: "When will a teacher reply?",
          a: <p>Each teacher shows the hours they usually reply. For anything urgent, call the school office on {school.phone}.</p>
        },
        {
          id: "report-block",
          q: "Someone sent me something upsetting",
          a: <p>Tap the ⋯ next to the message to report it to the school, or block the person. The school looks at every report.</p>
        }
      ]
    },
    {
      id: HELP.exams,
      title: "Online exams",
      icon: FileText,
      for: "student",
      questions: [
        {
          id: "sit-exam",
          q: "How do I sit an online exam?",
          a: (
            <p>
              Open <A href="/portal/exams">Exams</A>: it lists the exams open for you now and how long each one takes. Make sure you have enough time before you
              start. Some exams need a secret code that your teacher gives you in the hall.
            </p>
          )
        },
        {
          id: "exam-results",
          q: "When will I see my result?",
          a: (
            <p>
              Under <A href="/portal/exams/results">Exam results</A>, once your teachers have marked the exam and released the results.
            </p>
          )
        }
      ]
    },
    {
      id: HELP.account,
      title: "Signing in and your details",
      icon: UserRound,
      questions: [
        {
          id: "sign-in",
          q: "How do I sign in? I've forgotten my password",
          a:
            audience === "parent" ? (
              <p>
                Sign in with your email address and the password the school gave you. If you forget it, call the school office: they will set a new one for you.
              </p>
            ) : (
              <p>Sign in with your admission number and the password the school gave you. If you forget it, ask your class teacher or the school office.</p>
            )
        },
        {
          id: "wrong-details",
          q: audience === "parent" ? "My details are wrong, or I can't see one of my children" : "My details are wrong",
          a: <p>Please contact the school office. They can correct details and link children to your account.</p>
        }
      ]
    }
  ];

  const visible = topics
    .filter((t) => !t.for || t.for === audience)
    .map((t) => ({ ...t, questions: t.questions.filter((q) => !q.for || q.for === audience) }))
    .filter((t) => t.questions.length);

  return (
    <div className="space-y-6">
      <HelpOpener />
      <PortalPageHeader title="Help" description="Short answers to common questions. Can't find yours? Call or WhatsApp the school office." />

      <nav aria-label="Help topics" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {visible.map((t) => (
          <a
            key={t.id}
            href={`#${t.id}`}
            className="inline-flex min-h-[40px] shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:border-brand-green-200 hover:bg-brand-green-50/50"
          >
            <t.icon className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
            {t.title}
          </a>
        ))}
      </nav>

      {visible.map((t) => (
        <section key={t.id} id={t.id} aria-labelledby={`${t.id}-title`} className="scroll-mt-24">
          <h2 id={`${t.id}-title`} className="mb-3 flex items-center gap-2 text-lg font-semibold text-slate-900">
            <t.icon className="h-5 w-5 text-brand-green-600" aria-hidden="true" />
            {t.title}
          </h2>
          <Card className="divide-y divide-slate-100 overflow-hidden">
            {t.questions.map((q) => (
              <details key={q.id} id={q.id} className="group scroll-mt-24 target:bg-brand-green-50/40">
                <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-[15px] font-semibold text-slate-900 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
                  {q.q}
                  <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
                </summary>
                <div className="px-5 pb-4 text-sm leading-relaxed text-slate-700">{q.a}</div>
              </details>
            ))}
          </Card>
        </section>
      ))}

      <Card className="p-5">
        <h2 className="text-base font-semibold text-slate-900">Still need help?</h2>
        <p className="mt-1 text-sm text-slate-600">The school office is happy to help.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <a href={`tel:${school.phone}`} className="flex min-h-[48px] items-center gap-3 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:border-brand-green-200 hover:bg-brand-green-50/50">
            <Phone className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
            Call {school.phone}
          </a>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-[48px] items-center gap-3 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:border-brand-green-200 hover:bg-brand-green-50/50"
          >
            <MessagesSquare className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
            WhatsApp the office
          </a>
          <a href={`mailto:${school.email}`} className="flex min-h-[48px] items-center gap-3 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-800 hover:border-brand-green-200 hover:bg-brand-green-50/50">
            <Mail className="h-4 w-4 text-brand-green-600" aria-hidden="true" />
            Email the office
          </a>
        </div>
      </Card>
    </div>
  );
}
