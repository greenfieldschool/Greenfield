import type { ReactNode } from "react";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Bell, BookOpen, BookOpenText, CalendarCheck, Video, ChevronDown, FileText, Mail, MessagesSquare, NotebookPen, Phone, Receipt, UserRound } from "lucide-react";
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
          id: "earlier-years",
          q: "Can I still see report cards from an earlier class?",
          a: (
            <p>
              Yes. Moving up a class doesn&apos;t remove anything: every term the school has published for {audience === "parent" ? "your child" : "you"} stays
              under <A href="/portal/academics">Report card{audience === "parent" ? "s" : ""}</A>, exactly as it was published. Choose the school year (it shows the
              class {audience === "parent" ? "your child was" : "you were"} in) and then the term. Certificates from those terms are there too. The fees rule is
              the same for every term: a report card opens once that term&apos;s fees, and any earlier term&apos;s, are paid.
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
      id: HELP.assignments,
      title: "Assignments and classwork",
      icon: NotebookPen,
      questions: [
        {
          id: "hand-in",
          q: "How do I hand in an assignment?",
          for: "student",
          a: (
            <p>
              Open <A href="/portal/assignments">Assignments</A> and tap the work. Read what to do (and open the worksheet if there is one), then type your
              answer, or tap <strong>Take a photo</strong> to photograph your exercise book, or both, and tap <strong>Hand in</strong>. You can change it until
              your teacher marks it.
            </p>
          )
        },
        {
          id: "late",
          q: "I missed the due date",
          for: "student",
          a: (
            <p>
              You can usually still hand in: it shows as late. If the teacher isn&apos;t accepting late work for that piece, the page says so; speak to your
              teacher.
            </p>
          )
        },
        {
          id: "see-work",
          q: "How do I see my child's assignments?",
          for: "parent",
          a: (
            <p>
              Open <A href="/portal/assignments">Assignments</A> (under More on a phone). It shows what&apos;s to do, what&apos;s late, what&apos;s been
              handed in and the marks with the teacher&apos;s comments. Tap a piece of work to see what your child handed in. Only your child can hand work in.
            </p>
          )
        }
      ]
    },
    {
      id: HELP.notifications,
      title: "Notifications",
      icon: Bell,
      questions: [
        {
          id: "what-notifications",
          q: "What does the bell at the top show?",
          a: (
            <p>
              The bell shows how many new notifications you have. The school lets you know when a teacher sets new work, marks{" "}
              {audience === "parent" ? "your child's" : "your"} work, shares a lesson note, or schedules, moves or cancels an online class. Tap the bell to
              see them, then tap one to open it. It&apos;s marked as read when you open it, or tap <strong>Mark all as read</strong>.
            </p>
          )
        },
        {
          id: "phone-alerts",
          q: "Can I get alerts on my phone, like other apps?",
          a: (
            <>
              <p>
                Yes. Open <A href="/portal/notifications">Notifications</A> and tap <strong>Turn on phone notifications</strong>, then <strong>Allow</strong>{" "}
                when your phone asks. Alerts then appear on your lock screen even when the portal is closed. Tap one to open what it&apos;s about. Tap{" "}
                <strong>Send a test</strong> to see one.
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Android:</strong> works in Chrome, and best from the Greenfield icon on your home screen.
                </li>
                <li>
                  <strong>iPhone and iPad:</strong> first add the portal to your Home Screen (Safari → Share → <strong>Add to Home Screen</strong>), open
                  Greenfield from there, then turn alerts on. It needs iOS 16.4 or later.
                </li>
              </ul>
              <p className="mt-2">
                Turn it on for each phone you use. To stop alerts, tap <strong>Turn off</strong> on the same page. If you share a phone, alerts go to
                whoever last signed in on it.
              </p>
            </>
          )
        },
        {
          id: "sounds",
          q: "How do I turn the sounds off (or on)?",
          a: (
            <p>
              Tap your name or picture at the top right, then <strong>Sounds</strong>: it switches between On and Off, and the phone or computer remembers
              your choice. The portal plays a few short, quiet sounds: when something is saved or handed in, when a new notification arrives while
              you&apos;re using it, and for a great exam result. If your device is set to reduce motion, sounds start off.
            </p>
          )
        },
        {
          id: "notifications-phone",
          q: "Will I get an email too?",
          a: (
            <p>
              {audience === "parent" ? (
                <>
                  Yes, at the email address you sign in with: new work, marks, lesson notes, online classes, new messages and school announcements. Choose
                  which ones at the bottom of <A href="/portal/notifications">Notifications</A> (&ldquo;Email me about&rdquo;), or use the &ldquo;Stop these
                  emails&rdquo; link in any email. If you don&apos;t see them, check your Spam folder and mark them &ldquo;Not spam&rdquo;.
                </>
              ) : (
                <>Pupils don&apos;t get emails: everything shows here, on the bell. Your parents get the emails.</>
              )}
            </p>
          )
        }
      ]
    },
    {
      id: HELP.onlineClasses,
      title: "Online classes",
      icon: Video,
      questions: [
        {
          id: "join-class",
          q: "How do I join an online class?",
          a: (
            <p>
              Open <A href="/portal/online-classes">Online classes</A>{audience === "parent" ? " (under More on a phone)" : ""}. From 15 minutes before the
              start, the class shows at the top with a <strong>Join</strong> button: tap it and it opens Zoom, Google Meet or Teams. If it asks for a passcode,
              it&apos;s shown next to the time. Install the Zoom or Teams app beforehand if the teacher uses one of those.
            </p>
          )
        },
        {
          id: "class-attendance",
          q: "Does joining count as attendance?",
          a: (
            <p>
              Yes. Tapping <strong>Join</strong> here records that {audience === "parent" ? "your child" : "you"} joined, and the time. The teacher then
              confirms present, late or absent. Joining with a link copied from somewhere else isn&apos;t recorded, so always join from this page.
            </p>
          )
        },
        {
          id: "class-cancelled",
          q: "The class was moved or cancelled",
          a: (
            <p>
              When a teacher changes the time, the new time shows straight away. A cancelled class stays in the list, crossed out, with the teacher&apos;s
              reason. If the Join button doesn&apos;t appear at the time shown, ask the teacher.
            </p>
          )
        }
      ]
    },
    {
      id: HELP.lessonNotes,
      title: "Lesson notes",
      icon: BookOpenText,
      questions: [
        {
          id: "find-notes",
          q: "Where do I find the lesson notes?",
          a: (
            <p>
              Open <A href="/portal/lesson-notes">Lesson notes</A>{audience === "parent" ? " (under More on a phone)" : ""}. Notes are listed by week for the
              current term, newest first, and new ones are marked <strong>New</strong>. Choose a subject or a week, or type part of the topic (e.g.
              &ldquo;fractions&rdquo;) and tap <strong>Find</strong>. Tap <strong>All terms</strong> to revise from earlier terms.
            </p>
          )
        },
        {
          id: "download-notes",
          q: "How do I download or print a lesson note?",
          a: (
            <p>
              Tap the note, then <strong>Download</strong> to save the file (PDF, Word or PowerPoint) on your phone or computer, or <strong>Open</strong> to read
              it straight away and print it from there. If a link stops working, go back to the note and tap it again: links last 10 minutes so the notes stay
              private to the class.
            </p>
          )
        },
        {
          id: "missing-notes",
          q: "A lesson note I expected isn't there",
          a: (
            <p>
              Only notes the teacher has published show here; notes still being prepared don&apos;t. The list shows the class{" "}
              {audience === "parent" ? "your child is" : "you are"} in now. If it&apos;s still missing, ask the subject teacher.
            </p>
          )
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
        },
        {
          id: "home-screen",
          q: "Can I put the portal on my phone like an app?",
          a: (
            <>
              <p>Yes. Once it is on your home screen it opens full screen in one tap, with the school&apos;s crest as its icon.</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>
                  <strong>Android:</strong> tap <strong>Add to home screen</strong> on the portal&apos;s Home page, or open
                  the browser&apos;s menu (⋮) and choose <strong>Add to Home screen</strong> or <strong>Install app</strong>.
                </li>
                <li>
                  <strong>iPhone:</strong> open the portal in <strong>Safari</strong>, tap the Share button at the bottom,
                  then <strong>Add to Home Screen</strong>.
                </li>
              </ul>
            </>
          )
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
