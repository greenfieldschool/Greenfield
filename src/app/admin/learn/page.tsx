import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  ClipboardList,
  GraduationCap,
  HeartPulse,
  Library,
  MessagesSquare,
  SlidersHorizontal,
  Timer,
  UserPlus,
  Users,
  Wallet
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { toneStyles, type Tone } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";

export default function AdminLearnCentrePage() {
  const categories = [
    {
      title: "Core Student Lifecycle",
      icon: GraduationCap,
      tone: "blue" as Tone,
      guides: [
        {
          name: "Admissions & Enrollment Workflow",
          steps: [
            "Applicant completes the public admission form wizard at (/apply).",
            "Go to Core > Student applications (/admin/students/applications) to inspect pending profiles.",
            "Clicking 'Approve' assigns an admission number and inserts the student record into the 'students' table.",
            "Student level automatically syncs to match the selected class's level (e.g. primary Playgroup vs creche)."
          ]
        },
        {
          name: "Student Portal Accounts (Sign-in)",
          steps: [
            "Locate the enrolled student in Core > Students (/admin/students).",
            "Inside their detail view, find the 'Portal Account' configuration.",
            "Set a secure password and generate the account. This registers a virtual email (e.g. [admission_number]@students.greenfield.local) inside Supabase Auth."
          ]
        },
        {
          name: "Checking a Class and Fixing Wrong Registrations",
          steps: [
            "Open Core > Classes (/admin/classes) to see every class and how many current students it has.",
            "Click a class to list its children. Admins can correct the name, admission number, class or status on a row and press 'Save'.",
            "Changing the class moves the child to that class (their level follows the new class).",
            "Use the notice at the top of the Classes page to find current students who have no class yet.",
            "Classes registered twice (e.g. 'Reception' and 'RECEPTION', or 'Year 1' and 'YEAR1') are listed under 'Classes registered twice' at the top of the Classes page, with the one that has the most students marked 'Keep'. Press 'Merge into …' on the duplicate: its students, results, attendance, fees, exam sessions, subjects and teachers move to the class you keep, then it is deleted.",
            "A class created by mistake that nobody is in can be removed under 'Delete a class nobody is in'. A class that still has fees, results, attendance or exams cannot be deleted; merge it into another class, or deactivate it under Finance > Fee setup > Classes to hide it while keeping its records."
          ]
        }
      ]
    },
    {
      title: "Examination & Assessment Lifecycle",
      icon: Timer,
      tone: "violet" as Tone,
      guides: [
        {
          name: "Creating Tests & Setting Up Questions",
          steps: [
            "Go to Operations > Exams > Tests (/admin/exams/tests).",
            "Create a new test with its name, subject, duration (minutes) and the number of objective and theory questions you plan to set (e.g. 30 and 5).",
            "You are taken straight to the test, where a tracker shows how many questions are still left to set. The Tests list shows 'set / planned' for every test.",
            "Use 'Edit test name and duration' on the test page to change the time allowed later.",
            "Tests set before planned numbers existed: open the Tests page and press \'Use existing questions\' to fill in each test\'s objective and theory numbers from the questions it already has, or press \'Use these as targets\' on a single test.",
            "To change the number of questions later, open 'Configure question targets' on the test page. This works even after students have sat the test, because the numbers are only for planning.",
            "Configure question types (MCQ single/multi, true/false, fill-blank, essay) and points/marks.",
            "Add a picture (diagram, map, chart, photo) to a question with the 'Add picture' button under the prompt, or drag the picture onto it. PNG, JPG, WEBP or GIF up to 2 MB. Save the question to keep it. Students see the picture under the question and can open it full size.",
            "Open the 'Advanced (JSON)' section to modify or reuse structured options and answers."
          ]
        },
        {
          name: "Scheduling Exam Sessions",
          steps: [
            "Go to Operations > Exams > Sessions (/admin/exams/sessions).",
            "Create a session linking a Test to a specific Class, Academic Year, and Academic Term.",
            "Pick a Start date and End date (no times needed). Students in the class see the exam from the start of the start date until the end of the end date; the time allowed comes from the test's duration.",
            "Keep Status as 'active'. A 'draft' session is hidden from students. The sessions list shows 'Open to students now' or why a session is hidden.",
            "Enable 'Requires secret code' only if students must type a code given in the exam hall.",
            "To change how many objective and theory questions a session's test should have, open the session and use 'Number of questions'. The numbers are saved on the test, so every session using that test shows them.",
            "Students access scheduled exams via the student portal (/portal/login/student)."
          ]
        },
        {
          name: "Marking and Reviewing Scores",
          steps: [
            "Access the active session's 'Attempts' list in (/admin/exams/sessions/[id]/attempts).",
            "Review submissions by student, evaluate automatically graded answers, and manually score essays.",
            "Publish results to release final reports directly to the student portal."
          ]
        }
      ]
    },
    {
      title: "Academics & Configurations",
      icon: BookOpen,
      tone: "green" as Tone,
      guides: [
        {
          name: "Adding Subjects",
          steps: [
            "Open Academics > Subjects (/admin/academics/subjects).",
            "Add a new subject name (e.g. English Language) and tag it to a broad school section (creche, primary, secondary).",
            "Toggle 'Active' to enable selection across tests and class schedules.",
            "Only admins can add subjects. A subject with the same name and level as an existing one is rejected."
          ]
        },
        {
          name: "Removing Duplicate Subjects",
          steps: [
            "Open Academics > Subjects. Likely duplicates (e.g. 'HEALTH HABIT' and 'Health habit', 'ICT' and 'I.C.T') are listed at the top.",
            "Click 'Merge into …' to move the duplicate's results, CBT tests and class assignments onto the subject you keep. The duplicate is then deleted.",
            "For duplicates spelled differently, use 'Merge two subjects' and pick the one to remove and the one to keep.",
            "Subjects with no results can be deleted directly from the list."
          ]
        },
        {
          name: "Assigning Subjects to Classes",
          steps: [
            "Open Academics > Class subjects (/admin/academics/class-subjects) and pick a class.",
            "Tick every subject the class takes and click 'Save subjects'. Use 'Copy subjects from another class' to start from a similar class.",
            "The Result sheet then only offers that class's subjects, with quick links to switch between them."
          ]
        },
        {
          name: "Assigning Teachers to Classes and Subjects",
          steps: [
            "Open Academics > Teacher assignments (/admin/academics/teachers). Teachers must first have the Teacher role under Staff & users.",
            "Class teacher: pick the teacher, choose 'Class teacher' and tick one or more classes (use 'All creche classes' etc. to tick a whole level). They get those classes' students, attendance and every subject each class takes (set under Class subjects).",
            "Subject teacher: choose 'Subject teacher', tick the classes and the subjects. For example Mr Bello teaching IRS and Arabic from Year 2 to Year 4: tick Year 2, Year 3, Year 4, then IRS and Arabic. A teacher of French across the school: tick every class and French.",
            "A teacher can be both, e.g. class teacher of Year 1 and the French teacher in every class. Assignments are added, never replaced.",
            "Teachers then see only their classes, and in each class only their subjects, on the Result sheet and Assessments. They can only set CBT tests and questions for subjects they teach.",
            "Only class teachers (and admins) can publish a class's results or take attendance. Remove an assignment with the x beside it."
          ]
        },
        {
          name: "Entering Term Results (Result management)",
          steps: [
            "Open Result management > Class result sheet. Pick the class, subject and term (e.g. RECEPTION · Quantitative Reasoning · 2026/2027 First Term) and click Open sheet. Every pupil in the class is listed automatically.",
            "A new sheet opens with 1st CA (20), 2nd CA (20), Exam (Objective) (30) and Exam (Theory) (30), total 100. You can change the columns with Edit columns if a subject is assessed differently.",
            "Enter the 1st and 2nd CA and click Save changes. The exam boxes stay empty. Reopen the same sheet after the exam and enter the Objective and Theory scores: only the boxes you change are saved, so the CA scores are never lost.",
            "Scores above a column's maximum are refused. Each pupil's total out of 100 appears with 'so far' until every column is filled; then the grade and remark show (80–100 A Excellent, 70–79 B Very Good, 60–69 C Good, 50–59 D Pass, 0–49 F Fail).",
            "The Class summary shows the class average, highest, lowest and how many pupils got each grade. The bottom row shows each column's class average, and the Scores chart shows each pupil's CA (blue) and exam (orange) marks.",
            "Bulk upload: download the sheet as a CSV, fill it in Excel, copy the rows and paste them under Bulk upload. Empty cells are left as they are. Single pupil results lets you enter or check one pupil's scores for every subject at once.",
            "When a subject's scores match the marked scripts, click Submit as final. Use 'Copy CBT scores' to bring a computer-based exam into any column."
          ]
        },
        {
          name: "Final Scores, Corrections and the Results History",
          steps: [
            "When a subject's scores are all entered and checked against the marked scripts, the subject teacher clicks 'Submit as final' on the result sheet. The sheet is then locked: nobody (teachers or admins) can type over its scores or change its columns. Publishing a class's report cards locks every sheet and welfare rating for that class and term.",
            "Found a mistake on a final sheet? Click 'Request a correction', change only the wrong boxes, write why (e.g. 'script shows 15, keyed 17') and click 'Send to admin'. Nothing changes until an admin approves it. You can withdraw a request while it is waiting.",
            "Admins see waiting requests under Academics > Correction requests (and on the sheet itself). 'Approve' applies the new scores at once and the sheet stays locked; 'Reject' needs a note for the teacher. If a score changed after the request was made, approval is refused so nothing is overwritten unseen.",
            "For larger corrections an admin can still unlock the whole sheet with a reason, and the teacher submits it again afterwards. Published report cards are unpublished by an admin, also with a reason.",
            "Academics > Results history shows every score entered, changed or deleted (who, when, old and new score, typed or from a CBT exam or a correction), every column change, welfare rating, submission, correction request and decision, unlock, publish and unpublish. Teachers see the classes and subjects they teach; admins see everything. Nobody can edit or delete it."
          ]
        },
        {
          name: "Result Sheet Columns for the Whole School or a Level",
          steps: [
            "Open Academics > Grading & layouts (/admin/academics/config) > Result sheet columns.",
            "Set the whole-school default, and a different set for creche, primary or secondary if they are assessed differently.",
            "New sheets start from the most specific layout: the class and subject's own, then the level's, then the school default. Sheets that already exist keep their columns."
          ]
        },
        {
          name: "Welfare Scores (out of 100)",
          steps: [
            "Welfare is scored out of 100 per pupil per term. Admins set what it is made of under Welfare > Welfare criteria, per level.",
            "Default criteria: Attendance 20, Punctuality 10, Uniform 10 and Conduct 15 come automatically from attendance, 'late' marks, uniform checks and discipline records. Neatness, Politeness, Honesty, Cooperation, Attentiveness, Leadership and Participation (45 in total) are rated 1–5 by the class teacher.",
            "Class teachers rate their pupils on Welfare > Welfare scores (/admin/welfare/scores), and must keep attendance, uniform checks and discipline records up to date during the term.",
            "If a record-based criterion has nothing recorded (e.g. no uniform checks), it is left out and welfare is scored out of the rest. Health incidents never reduce the score.",
            "Pupils who are not yet rated are flagged on the score sheet and on the Report cards checklist."
          ]
        },
        {
          name: "Report Cards and Publishing",
          steps: [
            "Open Academics > Report cards (/admin/academics/reports) and pick the class and term.",
            "The checklist shows what is missing: subjects not fully scored, pupils without welfare ratings, attendance, and comments. Each line links to the page that fixes it.",
            "Term total = average of the academic average (average of all subject totals) and the welfare score. Positions are ranked on the term total; pupils with no scores are not ranked.",
            "Write comments on the Comments page: the class teacher for every pupil, the head teacher (admin) after. 'Suggest for blanks' fills in a starting comment from the pupil's term total to edit.",
            "Click 'Print all' to print or save all report cards as PDF (one A4 page per pupil). 'Hide positions' prints them without positions.",
            "Click 'Publish report cards'. If anything is still missing you are warned first. Parents and pupils then see the same report card on the portal and can print it."
          ]
        },
        {
          name: "Academic Calendars (Years & Terms)",
          steps: [
            "Open Operations > Finance > Academic config (/admin/finance/fees/academic-years).",
            "Add the Academic Year (e.g. 2026/2027) and toggle it 'Active'.",
            "Add Academic Terms (e.g. Term 1, Term 2) linking them to the year.",
            "Set active terms to dictate global database mappings for current grades and reports."
          ]
        },
        {
          name: "Assessment Weights & Grading scales",
          steps: [
            "Open Academics > Grading & layouts (/admin/academics/config).",
            "Configure Grading scale thresholds (e.g. A = 70 to 100) per level. They grade every subject total, the academic average and the term total.",
            "Assessment weights only apply to assessments created on the Assessments page, not to the result sheet."
          ]
        }
      ]
    },
    {
      title: "Messages",
      icon: MessagesSquare,
      tone: "blue" as Tone,
      guides: [
        {
          name: "How Messages Work (Teachers and Parents)",
          steps: [
            "Open Messages (/admin/messages for staff, Messages in the parent portal). Who can talk to whom follows enrolment: when a pupil moves class, their parents move to the new class's spaces automatically.",
            "Every class has two spaces: Announcements (teachers of the class post, parents read) and the Parents' chat (parents talk to each other; the class teacher and admins can read it, and parents are told so).",
            "Click New for a private message. Teachers can message parents of pupils in classes they teach (as class teacher or subject teacher). Parents can message their children's teachers.",
            "Parents can message other parents in the same class only if that parent has switched on 'Let other parents message me' (off by default). They can block anyone. Phone numbers and emails are never shown.",
            "Teachers set when they usually reply under Messages > settings (default Mon–Fri 08:00–16:00). Parents see it, plus the school office number for anything urgent. Messages still arrive at any time; there is no need to reply outside those hours."
          ]
        },
        {
          name: "Keeping Chats Safe (Moderation)",
          steps: [
            "Anyone can report a message with the ⋯ menu. Reports go to Messages > Moderation (admins).",
            "Admins can remove a message (with a reason), dismiss a report, or mute a parent in a class chat for 1, 7 or 30 days. Class teachers can remove messages and mute in their own class spaces.",
            "Nothing is ever deleted: unsent (within 15 minutes) and removed messages are hidden from the chat but the original is kept in the school record.",
            "Teacher–parent private messages are kept as a school record and admins can read them under Moderation > Teacher–parent messages. Private messages between two parents are only seen by the school if one is reported.",
            "Students have no access to Messages."
          ]
        }
      ]
    },
    {
      title: "Finance",
      icon: Wallet,
      tone: "gold" as Tone,
      guides: [
        {
          name: "Recording Payments by Student and Class",
          steps: [
            "Open Finance > Payments > Record payment and pick the Student — the list is grouped by class. Picking an invoice instead fills in its student automatically.",
            "The Payments page shows each payment's student and class. Filter by class and dates to get the total collected for a class; the 'Amount collected per class' table compares classes.",
            "Open Finance > Debtors to see invoiced, paid and outstanding per class, then click a class to list the children who still owe, with WhatsApp and 'Record payment' shortcuts."
          ]
        },
        {
          name: "Editing or Voiding a Payment",
          steps: [
            "Open Operations > Finance > Payments (/admin/finance/payments) and click the payment to change.",
            "Correct the guardian, invoice, amount, method, reference, date or notes and click 'Save changes'. Invoice balances update automatically.",
            "To cancel a payment but keep a record, set Status to 'void' (it is then ignored in balances).",
            "'Delete payment' removes it and its invoice links completely and cannot be undone."
          ]
        }
      ]
    },
    {
      title: "Welfare & Operations",
      icon: HeartPulse,
      tone: "rose" as Tone,
      guides: [
        {
          name: "Attendance Marking",
          steps: [
            "Navigate to Welfare > Attendance (/admin/welfare/attendance).",
            "Filter by class level, date, year, and term.",
            "Select attendance state ('present', 'absent', 'late', 'excused') and click Save per student."
          ]
        },
        {
          name: "Creating Subject Assessments",
          steps: [
            "Go to Operations > Exams > Assessments (/admin/academics/assessments).",
            "Add a new assessment specifying the class, subject, year, term, assessment type, and maximum score.",
            "Clicking on the created assessment redirects to the scores page where teachers can log grades."
          ]
        }
      ]
    }
  ];

  const shortcuts = [
    { href: "/admin/students", label: "Student List", icon: Users },
    { href: "/admin/students/applications", label: "Admissions Applications", icon: UserPlus },
    { href: "/admin/finance/fees/academic-years", label: "Academic Calendar", icon: CalendarDays },
    { href: "/admin/academics/config", label: "Grading Scales", icon: SlidersHorizontal },
    { href: "/admin/academics/subjects", label: "Subject Management", icon: Library },
    { href: "/admin/exams/tests", label: "Exams & Tests", icon: ClipboardList }
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Knowledge Base"
        title="Admin Learn Centre"
        description="A scalable documentation directory for managing the school's operational lifecycle, grading scales, admissions, examinations, and subjects."
      />

      {/* Category directory */}
      <nav aria-label="Guide categories" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {categories.map((cat, idx) => (
          <a
            key={idx}
            href={`#learn-${idx}`}
            className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:border-brand-green-200 hover:shadow-lift"
          >
            <span className={cn("inline-flex h-10 w-10 items-center justify-center rounded-xl", toneStyles[cat.tone].icon)}>
              <cat.icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="mt-3 text-sm font-semibold text-slate-900">{cat.title}</span>
            <span className="mt-0.5 text-xs text-slate-500">
              {cat.guides.length} guide{cat.guides.length === 1 ? "" : "s"}
            </span>
          </a>
        ))}
      </nav>

      {/* Guides */}
      <div className="space-y-10">
        {categories.map((cat, idx) => (
          <section key={idx} id={`learn-${idx}`} aria-labelledby={`learn-${idx}-title`} className="scroll-mt-24">
            <div className="mb-4 flex items-center gap-3">
              <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl", toneStyles[cat.tone].icon)}>
                <cat.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <h2 id={`learn-${idx}-title`} className="text-lg font-semibold text-slate-900">
                {cat.title}
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {cat.guides.map((guide, gIdx) => (
                <Card key={gIdx}>
                  <CardHeader title={guide.name} />
                  <ol className="space-y-3 px-5 py-5 sm:px-6">
                    {guide.steps.map((step, sIdx) => (
                      <li key={sIdx} className="flex gap-3 text-sm leading-relaxed text-slate-700">
                        <span
                          className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-green-50 text-xs font-semibold text-brand-green-700 ring-1 ring-inset ring-brand-green-200/70"
                          aria-hidden="true"
                        >
                          {sIdx + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader title="Quick Shortcuts" />
        <div className="grid gap-2 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
          {shortcuts.map((sc) => (
            <Link
              key={sc.href}
              href={sc.href}
              className="group flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-brand-green-200 hover:bg-brand-green-50/50 hover:text-brand-green-800"
            >
              <sc.icon className="h-4 w-4 text-slate-400 group-hover:text-brand-green-600" aria-hidden="true" />
              <span className="flex-1">{sc.label}</span>
              <ArrowRight className="h-4 w-4 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand-green" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
