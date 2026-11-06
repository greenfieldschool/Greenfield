import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  HeartPulse,
  MessagesSquare,
  Timer,
  Wallet
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { toneStyles, type Tone } from "@/components/ui/stat-card";
import { cn } from "@/lib/cn";
import { LEARN, type LearnGuide } from "@/lib/learn-guides";
import { Badge } from "@/components/ui/badge";
import { LearnSearch } from "./learn-search";

type Guide = {
  id: LearnGuide;
  name: string;
  /** The page the guide is about; each guide card links to it. */
  page: { href: string; label: string };
  /** Only admins can open the page, so teachers know it isn't for them. */
  adminOnly?: boolean;
  steps: string[];
};

type Category = { title: string; icon: LucideIcon; tone: Tone; guides: Guide[] };

// Guides for staff. Each has an id from LEARN, and the page it is about passes the same id to its PageHeader,
// which shows "How this works" linking straight here (#id). Update the guide when the workflow changes.
export default function AdminLearnCentrePage() {
  const categories: Category[] = [
    {
      title: "Pupils, Parents & Staff",
      icon: GraduationCap,
      tone: "blue",
      guides: [
        {
          id: LEARN.admissions,
          name: "Admissions & Enrollment Workflow",
          page: { href: "/admin/students/applications", label: "Student applications" },
          adminOnly: true,
          steps: [
            "Families apply online with the admission form on the school website (/apply).",
            "Open Core > Student applications (/admin/students/applications) to see applications waiting for a decision.",
            "Clicking 'Approve' gives the child an admission number and adds them to the Students list.",
            "The child's level (creche, primary, secondary) follows the class you choose, e.g. Playgroup is primary."
          ]
        },
        {
          id: LEARN.studentAccounts,
          name: "Student Portal Accounts (Sign-in)",
          page: { href: "/admin/students", label: "Students" },
          adminOnly: true,
          steps: [
            "Find the pupil in Core > Students (/admin/students) and open their page.",
            "Under 'Portal Account', set a password and create the account.",
            "Pupils sign in at the portal with their admission number and that password. Give it to them privately; you can reset it from the same place."
          ]
        },
        {
          id: LEARN.classes,
          name: "Checking a Class and Fixing Wrong Registrations",
          page: { href: "/admin/classes", label: "Classes" },
          steps: [
            "Open Core > Classes (/admin/classes) to see every class and how many current students it has.",
            "Click a class to list its children. Admins can correct the name, admission number, class or status on a row and press 'Save'.",
            "Changing the class moves the child to that class (their level follows the new class).",
            "Use the notice at the top of the Classes page to find current students who have no class yet.",
            "Classes registered twice (e.g. 'Reception' and 'RECEPTION', or 'Year 1' and 'YEAR1') are listed under 'Classes registered twice' at the top of the Classes page, with the one that has the most students marked 'Keep'. Press 'Merge into …' on the duplicate: its students, results, attendance, fees, exam sessions, subjects and teachers move to the class you keep, then it is deleted.",
            "A class created by mistake that nobody is in can be removed under 'Delete a class nobody is in'. A class that still has fees, results, attendance or exams cannot be deleted; merge it into another class, or deactivate it under Finance > Fee setup > Classes to hide it while keeping its records."
          ]
        },
        {
          id: LEARN.guardians,
          name: "Parents, Guardians and Portal Accounts",
          page: { href: "/admin/guardians", label: "Guardians" },
          adminOnly: true,
          steps: [
            "Open Core > Guardians (/admin/guardians) and add the parent or guardian. An email address is needed for a portal account; a phone number helps the office.",
            "Open the guardian and use 'Link a student' to connect each of their children, with the relationship (mother, father, guardian …). A child can have several guardians and each one sees the child in the portal.",
            "Under 'Portal access', create the account with a first password and give it to the parent privately (it can be printed). Parents can't reset their own password: reset it here when they forget.",
            "Parents sign in at the portal with their email address. They see report cards, fees & billing, attendance, discipline, health notes, activities and messages for their linked children only.",
            "Invoices are addressed to one guardian, but report cards and the unpaid-fees hold go by the child, so every guardian of the child sees the same."
          ]
        },
        {
          id: LEARN.staffAccounts,
          name: "Staff Accounts and Roles",
          page: { href: "/admin/users", label: "Staff & users" },
          adminOnly: true,
          steps: [
            "Open Core > Staff & users (/admin/users). Invite a member of staff by email with their role: Admin, Teacher, Front desk or Nurse. They get an email to set their password.",
            "No email? Use 'Manual link' to make a one-time sign-in link and send it to that person only. Anyone with the link can sign in as them.",
            "Change a person's role from the list. Admins see everything; teachers see only their classes and subjects; Front desk and Nurse see the areas they need.",
            "After giving someone the Teacher role, assign their classes and subjects under Academics > Teacher assignments, or they will see no classes."
          ]
        }
      ]
    },
    {
      title: "Exams (CBT)",
      icon: Timer,
      tone: "violet",
      guides: [
        {
          id: LEARN.tests,
          name: "Creating Tests & Setting Up Questions",
          page: { href: "/admin/exams/tests", label: "Tests" },
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
          id: LEARN.sessions,
          name: "Scheduling Exam Sessions",
          page: { href: "/admin/exams/sessions", label: "Exam sessions" },
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
          id: LEARN.marking,
          name: "Marking and Reviewing Scores",
          page: { href: "/admin/exams/sessions", label: "Exam sessions" },
          steps: [
            "Open Exams > Sessions, click the session, then 'Attempts' to see every pupil's submission.",
            "Objective answers are marked automatically. Open an attempt to mark theory and essay answers by hand.",
            "When marking is done, release the results from the session page ('Attempts & results release'); pupils then see them under Exam results in the portal. Use 'Copy CBT scores' on the result sheet to bring the scores into a term result column."
          ]
        }
      ]
    },
    {
      title: "Academics & Results",
      icon: BookOpen,
      tone: "green",
      guides: [
        {
          id: LEARN.subjects,
          name: "Adding Subjects",
          page: { href: "/admin/academics/subjects", label: "Subjects" },
          adminOnly: true,
          steps: [
            "Open Academics > Subjects (/admin/academics/subjects).",
            "Add a new subject name (e.g. English Language) and tag it to a broad school section (creche, primary, secondary).",
            "Toggle 'Active' to enable selection across tests and class schedules.",
            "Only admins can add subjects. A subject with the same name and level as an existing one is rejected."
          ]
        },
        {
          id: LEARN.duplicateSubjects,
          name: "Removing Duplicate Subjects",
          page: { href: "/admin/academics/subjects", label: "Subjects" },
          adminOnly: true,
          steps: [
            "Open Academics > Subjects. Likely duplicates (e.g. 'HEALTH HABIT' and 'Health habit', 'ICT' and 'I.C.T') are listed at the top.",
            "Click 'Merge into …' to move the duplicate's results, CBT tests and class assignments onto the subject you keep. The duplicate is then deleted.",
            "For duplicates spelled differently, use 'Merge two subjects' and pick the one to remove and the one to keep.",
            "Subjects with no results can be deleted directly from the list."
          ]
        },
        {
          id: LEARN.classSubjects,
          name: "Assigning Subjects to Classes",
          page: { href: "/admin/academics/class-subjects", label: "Class subjects" },
          adminOnly: true,
          steps: [
            "Open Academics > Class subjects (/admin/academics/class-subjects) and pick a class.",
            "Tick every subject the class takes and click 'Save subjects'. Use 'Copy subjects from another class' to start from a similar class.",
            "The Result sheet then only offers that class's subjects, with quick links to switch between them."
          ]
        },
        {
          id: LEARN.teachers,
          name: "Assigning Teachers to Classes and Subjects",
          page: { href: "/admin/academics/teachers", label: "Teacher assignments" },
          adminOnly: true,
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
          id: LEARN.results,
          name: "Entering Term Results (Result management)",
          page: { href: "/admin/academics/results", label: "Class result sheet" },
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
          id: LEARN.corrections,
          name: "Final Scores, Corrections and the Results History",
          page: { href: "/admin/academics/corrections", label: "Correction requests" },
          steps: [
            "When a subject's scores are all entered and checked against the marked scripts, the subject teacher clicks 'Submit as final' on the result sheet. The sheet is then locked: nobody (teachers or admins) can type over its scores or change its columns. Publishing a class's report cards locks every sheet and welfare rating for that class and term.",
            "Found a mistake on a final sheet? Click 'Request a correction', change only the wrong boxes, write why (e.g. 'script shows 15, keyed 17') and click 'Send to admin'. Nothing changes until an admin approves it. You can withdraw a request while it is waiting.",
            "Admins see waiting requests under Academics > Correction requests (and on the sheet itself). 'Approve' applies the new scores at once and the sheet stays locked; 'Reject' needs a note for the teacher. If a score changed after the request was made, approval is refused so nothing is overwritten unseen.",
            "For larger corrections an admin can still unlock the whole sheet with a reason, and the teacher submits it again afterwards. Published report cards are unpublished by an admin, also with a reason.",
            "Academics > Results history shows every score entered, changed or deleted (who, when, old and new score, typed or from a CBT exam or a correction), every column change, welfare rating, submission, correction request and decision, unlock, publish and unpublish. Teachers see the classes and subjects they teach; admins see everything. Nobody can edit or delete it."
          ]
        },
        {
          id: LEARN.resultColumns,
          name: "Result Sheet Columns for the Whole School or a Level",
          page: { href: "/admin/academics/config", label: "Grading & layouts" },
          adminOnly: true,
          steps: [
            "Open Academics > Grading & layouts (/admin/academics/config) > Result sheet columns.",
            "Set the whole-school default, and a different set for creche, primary or secondary if they are assessed differently.",
            "New sheets start from the most specific layout: the class and subject's own, then the level's, then the school default. Sheets that already exist keep their columns."
          ]
        },
        {
          id: LEARN.welfare,
          name: "Weekly Welfare Scores (out of 100 every week)",
          page: { href: "/admin/welfare/scores", label: "Welfare score sheet" },
          steps: [
            "Welfare is scored every week, out of 100 per pupil. At the end of term the weekly scores are averaged into one welfare score out of 100. The final score on the report card = (academic average + welfare) ÷ 2.",
            "The marks: Attendance 15, Punctuality 10, Uniform & appearance 10, Conduct 15, Politeness & respect 10, Honesty 5, Cooperation & relationship with others 5, Attentiveness & self-control 5, Leadership & responsibility 5, Participation (sports, clubs, crafts) 20 = 100. Admins can change them under Welfare > Welfare criteria, per level.",
            "Attendance, Punctuality, Uniform and Conduct are worked out for each week from that week's attendance, 'late' marks, uniform checks and discipline records, so keep those up to date. The class teacher rates the rest from 1 (Poor) to 5 (Excellent): a 4 on a 10-mark criterion gives 8 marks.",
            "Class teachers open Welfare > Welfare score sheet (/admin/welfare/scores), pick the class and term, and land on this week. Every pupil is listed with the criteria across the row; rate them and save the whole class at once. Pick another week from the strip of weeks; each shows whether it is fully scored.",
            "To save time: 'Copy week N into empty boxes' fills each pupil's empty boxes with last week's ratings, and 'Fill empty…' under a heading fills that column. Change only what was different, then 'Save week'. Changed boxes are blue until saved; empty ones are gold. You are warned if you leave with unsaved changes.",
            "A week counts towards the term once the pupil is rated for it. Weeks with attendance but no ratings are flagged as 'to rate'. If nothing was recorded for a criterion that week (e.g. no uniform check), it is left out and the week is scored out of the rest. Health incidents never reduce the score.",
            "The Term summary tab shows every pupil's weekly scores, their term welfare, academic average and final score.",
            "Compulsory weeks (admins): under Welfare > Compulsory weeks (/admin/welfare/weeks), pick the term and tick the weeks every class must fill, for example every week except the mid-term break, then save. 'Make every week compulsory' ticks them all; 'None compulsory' clears them. Those weeks are marked 'Compulsory' on the score sheet, which lists any still to fill, and report cards can't be published until every pupil is scored for each of them."
          ]
        },
        {
          id: LEARN.reportCards,
          name: "Report Cards and Publishing",
          page: { href: "/admin/academics/reports", label: "Report cards" },
          steps: [
            "Open Academics > Report cards (/admin/academics/reports) and pick the class and term.",
            "The checklist shows what is missing: subjects not fully scored, pupils without welfare ratings, attendance, and comments. Each line links to the page that fixes it.",
            "Final score = (academic average + welfare) ÷ 2. The academic average is the average of all subject totals; welfare is the average of the weekly welfare scores. Positions are ranked on the final score; pupils with no scores are not ranked.",
            "Write comments on the Comments page: the class teacher for every pupil, the head teacher (admin) after. 'Suggest for blanks' fills in a starting comment from the pupil's final score to edit.",
            "Click 'Print all' to print or save all report cards as PDF (one A4 page per pupil). 'Hide positions' prints them without positions.",
            "Click 'Publish report cards'. If anything is still missing you are warned first. Parents and pupils then see the same report card on the portal and can print it.",
            "Compulsory welfare weeks are the exception: if an admin made weeks compulsory (Welfare > Compulsory weeks) and some pupils haven't been scored for one of them, the checklist shows which and publishing is blocked until they are filled, or until an admin un-ticks the week.",
            "Fees first: on the portal, a report card (and its certificates) only opens once the pupil's fees for that term and earlier terms are paid. Until then the parent sees a message with the amount owed and a 'Pay fees' button, and the pupil is asked to speak to their parent. Admins see who is held on the Report cards page ('Held from parents: fees owed'). Staff can still print report cards from the dashboard."
          ]
        },
        {
          id: LEARN.publishedResults,
          name: "Published Results (archive)",
          page: { href: "/admin/academics/published", label: "Published results" },
          steps: [
            "Open Result management > Published results. It lists every class result that has been published to parents, newest term first.",
            "Who sees what: admins and front desk (admissions) see every class; a class teacher sees their own classes. Subject teachers and the nurse don't see this page. Parents and pupils see only their own child's report card on the portal.",
            "Narrow the list by session, term, level or class, or type a pupil's name or admission number to find all of their published results.",
            "Click 'View' to see the whole class ranked on the final score, with every subject, the academic average, welfare, final score and grade. 'Print this list' prints it as a broadsheet.",
            "Click 'Report cards' to print the class's report cards (or 'Report card' beside one pupil), and 'Excel' to download the class result as a spreadsheet.",
            "When a class's report cards are published, a copy is saved automatically. Past terms then stay exactly as they were published, even after pupils move up a class or the grading changes. Results published before copies were kept show 'No saved copy yet'; an admin can click 'Save copies now' to keep them as they are today.",
            "This page only shows results. To publish, unpublish or correct results, use Report cards (admins and class teachers)."
          ]
        },
        {
          id: LEARN.certificates,
          name: "Certificates of Achievement",
          page: { href: "/admin/academics/reports", label: "Report cards" },
          steps: [
            "Open Academics > Report cards, pick the class and term, then click 'Certificates'.",
            "Certificates are given automatically from the report cards: 1st, 2nd and 3rd in class on the final score (gold, silver and bronze seals), the best score in each subject, and Gold, Silver or Bronze for welfare (the marks are set per level with the welfare criteria).",
            "Use the tabs to print only one kind (e.g. Class positions for prize-giving day). Check the 'Who gets a certificate' list, then click Print. Each certificate prints on its own A4 landscape page.",
            "Signatures: each member of staff signs once under My profile > Your signature, with a finger, stylus or mouse, or by uploading a photo of their signature on white paper. The class teacher's signature goes on their class's certificates; an admin chooses whose signature goes on the head teacher's line (and its title, e.g. Principal) under Settings. The Certificates page shows which signatures are in. A line with no saved signature is left blank to sign by hand.",
            "Saved signatures also appear on the certificates parents open in the portal. Only the person who saved a signature can change or remove it.",
            "Print after publishing: until then scores, positions and awards can still change.",
            "Parents see their child's certificates on the portal under the report card ('View certificates') and can print them, once fees are paid."
          ]
        },
        {
          id: LEARN.calendar,
          name: "Academic Calendars (Years & Terms)",
          page: { href: "/admin/finance/fees/academic-years", label: "Academic years & terms" },
          adminOnly: true,
          steps: [
            "Open Finance > Fee setup > Academic years & terms (/admin/finance/fees/academic-years).",
            "Add the academic year (e.g. 2026/2027) with its start and end dates and make it 'Active'. Only one year is active at a time.",
            "Add its terms (First, Second, Third term) with start and end dates. The term dates decide the weeks on the welfare score sheet and the 'Next term begins' date on report cards.",
            "Mark the current term active: pages open on it by default (result sheets, welfare scores, report cards)."
          ]
        },
        {
          id: LEARN.grading,
          name: "Assessment Weights & Grading scales",
          page: { href: "/admin/academics/config", label: "Grading & layouts" },
          adminOnly: true,
          steps: [
            "Open Academics > Grading & layouts (/admin/academics/config).",
            "Set the grading scale per level (school default: 80–100 A Excellent, 70–79 B Very Good, 60–69 C Good, 50–59 D Pass, 0–49 F Fail). It grades every subject total, the academic average and the final score.",
            "Assessment weights only apply to assessments created on the Assessments page, not to the result sheet."
          ]
        }
      ]
    },
    {
      title: "Messages",
      icon: MessagesSquare,
      tone: "blue",
      guides: [
        {
          id: LEARN.messages,
          name: "How Messages Work (Teachers and Parents)",
          page: { href: "/admin/messages", label: "Messages" },
          steps: [
            "Open Messages (/admin/messages for staff, Messages in the parent portal). Who can talk to whom follows enrolment: when a pupil moves class, their parents move to the new class's spaces automatically.",
            "Every class has two spaces: Announcements (teachers of the class post, parents read) and the Parents' chat (parents talk to each other; the class teacher and admins can read it, and parents are told so).",
            "Click New for a private message. Teachers can message parents of pupils in classes they teach (as class teacher or subject teacher). Parents can message their children's teachers.",
            "Parents can message other parents in the same class only if that parent has switched on 'Let other parents message me' (off by default). They can block anyone. Phone numbers and emails are never shown.",
            "Teachers set when they usually reply under Messages > settings (default Mon–Fri 08:00–16:00). Parents see it, plus the school office number for anything urgent. Messages still arrive at any time; there is no need to reply outside those hours."
          ]
        },
        {
          id: LEARN.moderation,
          name: "Keeping Chats Safe (Moderation)",
          page: { href: "/admin/messages/moderation", label: "Moderation" },
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
      tone: "gold",
      guides: [
        {
          id: LEARN.feeSetup,
          name: "Setting Up Fees (fee types, components and schedules)",
          page: { href: "/admin/finance/fees", label: "Fee setup" },
          adminOnly: true,
          steps: [
            "Set fees up once a year under Finance > Fee setup, in this order: academic year and terms, fee types (with their payment IDs), fee components, then a fee schedule for each class.",
            "Fee types & payment IDs: the kinds of money the school receives, e.g. School fees (SF), Uniform (UNI). Each has the short payment ID parents write on bank transfers.",
            "Fee components: the lines that make up a bill (Tuition, Books, Transport …). Link each to its fee type, so payments and reports know what the money was for. Linking a budget sector is optional.",
            "Fee schedules: create one for each class, for one term (choose the term) or for the whole year (leave the term blank). Open it and add each component with its amount.",
            "A schedule is a price list: changing it does not change invoices already made from it. Fix those on the invoice itself."
          ]
        },
        {
          id: LEARN.invoices,
          name: "Creating Invoices",
          page: { href: "/admin/finance/invoices", label: "Invoices" },
          adminOnly: true,
          steps: [
            "Open Finance > Invoices > New invoice. Choose the guardian it is addressed to, the pupil it is for, the year and term, and the due date. The invoice number (e.g. INV-2026-00012) is given automatically.",
            "Always pick the pupil and the term. Bank matching uses the pupil, and the report-card hold uses the term.",
            "On the next screen press 'Generate from fee schedule' to fill in the lines from the class's schedule, or add lines one by one.",
            "Discounts, waivers, penalties and write-offs go under 'Add adjustment', so the original fees stay visible on the invoice.",
            "New invoices are labelled 'draft', but parents see them straight away under Fees & billing, with the balance and the exact text to write on a bank transfer. They count as owed (for debtors and the report-card hold) until the balance is 0.",
            "Payments reduce the balance on their own (see 'Allocations' on the invoice)."
          ]
        },
        {
          id: LEARN.feeHold,
          name: "Report Cards and Unpaid Fees",
          page: { href: "/admin/academics/reports", label: "Report cards" },
          adminOnly: true,
          steps: [
            "Parents and pupils only see a published report card (and its certificates) on the portal once the pupil's fees are paid: every invoice for that term and earlier terms with nothing left to pay. Voided invoices don't count; invoices for a later term don't hold back this term.",
            "Until then the parent sees 'report card is ready' with the amount owed, a 'Pay fees' button, and a note that bank transfers can take a little while to be recorded. The pupil is asked to speak to their parent.",
            "As soon as the payment is recorded (by hand, from the bank statement or an alert), the report card opens on its own. There is nothing else to do.",
            "Admins see who is held on Academics > Report cards: the Publish box counts them and each pupil shows 'Held from parents: fees owed'. Staff can still print any report card."
          ]
        },
        {
          id: LEARN.recordingPayments,
          name: "Recording Payments by Student and Class",
          page: { href: "/admin/finance/payments", label: "Payments" },
          adminOnly: true,
          steps: [
            "Open Finance > Payments > Record payment and pick the Student — the list is grouped by class. Picking an invoice instead fills in its student automatically.",
            "The Payments page shows each payment's student and class. Filter by class and dates to get the total collected for a class; the 'Amount collected per class' table compares classes.",
            "Open Finance > Debtors to see invoiced, paid and outstanding per class, then click a class to list the children who still owe, with WhatsApp and 'Record payment' shortcuts."
          ]
        },
        {
          id: LEARN.paymentIds,
          name: "Payment IDs and Bank Statements (automatic matching)",
          page: { href: "/admin/finance/payments/import", label: "Bank statement & alerts" },
          adminOnly: true,
          steps: [
            "Every fee type has a short payment ID (School fees = SF, Uniform = UNI ...). See or change them under Finance > Fees > Fee types & payment IDs. Print them on fee notices.",
            "A payment ID is 2 to 8 capital letters or numbers with no spaces. New fee types get one from the first letters of their name (School fees = SF, Sports and Games = SAG; a one-word name uses its first three letters, Uniform = UNI). If two would clash, a number is added (SF2). INV, NGN, GRE, POS, TRF and NIP can't be used because they already appear in bank descriptions.",
            "Parents write the child's admission number and the payment ID in the bank transfer description, e.g. GRE/2026/447 SF. An invoice number (INV-2026-00012) also works. Each invoice page and the parent's Fees & billing page show the exact text to write.",
            "Monthly statement: open Finance > Payments > Bank statement & alerts, upload the bank's CSV (or paste the rows) and press 'Read and match'. Payments already added before are skipped, so adding the same month twice is safe.",
            "Sure matches are recorded as payments straight away: a known admission number, a payment ID that matches one of the child's unpaid invoices, and an amount that is not more than what is owed.",
            "Anything else waits under 'Needs a look' with a note saying why (no payment ID, two children named, amount too big, unknown child). Press Confirm on the suggestion, type the admission number or invoice number, or Ignore the line.",
            "Bank email alerts can be recorded automatically too, after a one-time setup by the school's IT person (the steps are in the project's BANK_ALERTS guide). Alerts go through the same matching and the same inbox."
          ]
        },
        {
          id: LEARN.editPayment,
          name: "Editing or Voiding a Payment",
          page: { href: "/admin/finance/payments", label: "Payments" },
          adminOnly: true,
          steps: [
            "Open Finance > Payments (/admin/finance/payments) and click the payment to change.",
            "Correct the guardian, invoice, amount, method, reference, date or notes and click 'Save changes'. Invoice balances update automatically.",
            "To cancel a payment but keep a record, set Status to 'void' (it is then ignored in balances).",
            "'Delete payment' removes it and its invoice links completely and cannot be undone."
          ]
        },
        {
          id: LEARN.expenses,
          name: "Recording Expenses",
          page: { href: "/admin/finance/expenses", label: "Expenses" },
          adminOnly: true,
          steps: [
            "Open Finance > Expenses > New expense. Only the amount is needed.",
            "Add the category (budget sector), vendor, method, reference and date: they make the spending reports useful.",
            "Pick the year and term to compare spending term by term. Budget sectors are set up under Fee setup > Budget sectors."
          ]
        }
      ]
    },
    {
      title: "Welfare & Attendance",
      icon: HeartPulse,
      tone: "rose",
      guides: [
        {
          id: LEARN.attendance,
          name: "Attendance Marking",
          page: { href: "/admin/welfare/attendance", label: "Attendance" },
          steps: [
            "Open Welfare > Attendance (/admin/welfare/attendance) and pick the class and date, or click 'Take the register' on the welfare score sheet to open this class on a missing day of that week.",
            "Everyone starts as Present: change the pupils who were absent, late or excused, then click 'Save register' once for the whole class. The strip of days shows which days of the week are taken and which are not.",
            "Attendance feeds the weekly welfare score: Attendance = days present ÷ days taken that week, Punctuality = days on time ÷ days present. Report cards show 'present X of Y days'."
          ]
        },
        {
          id: LEARN.welfareRecords,
          name: "Uniform Checks, Discipline and Health Notes",
          page: { href: "/admin/welfare/uniform", label: "Uniform checks" },
          steps: [
            "These records feed the weekly welfare score on their own, in the week they happen: uniform checks give Uniform & appearance, discipline records take marks off Conduct. Health notes never affect any score.",
            "Uniform checks (Welfare > Uniform): pick the class and the day. Everyone starts as Neat: mark the pupils whose uniform wasn't right (with a note if you like) and click 'Save uniform check' once. You don't have to check every day. The week's mark = checks passed ÷ checks done; with no checks that week, Uniform is left out and the week is scored out of the rest. 'Remove this day's check' undoes a day saved by mistake.",
            "Discipline (Welfare > Discipline): the pupil, when it happened, the category (e.g. Late-coming, Fighting), what happened and how serious it was, 1 (minor) to 5 (very serious). Conduct starts full every week; each record takes off its severity × the penalty for the level (1 mark per severity point unless an admin changes it under Welfare criteria). The date decides which week it counts in.",
            "From the welfare score sheet: the 'This week's records' box shows what is missing for that week, and its buttons open these pages on the class and week, with 'Back to the welfare score sheet' at the top. The sheet's four record columns (Attendance, Punctuality, Uniform, Conduct) can't be typed on the sheet itself: they always come from these records.",
            "Health & incidents (Welfare > Health & incidents): sickness, injuries and other notes, with severity. Click the status to mark it resolved.",
            "Parents see discipline and health records in the portal. Write them in plain, factual words, as you would say them to the parent.",
            "Pick the right term on each record. Records are also matched to the week and term by their date."
          ]
        },
        {
          id: LEARN.assessments,
          name: "Creating Subject Assessments",
          page: { href: "/admin/academics/assessments", label: "Assessments" },
          steps: [
            "Open Academics > Assessments (/admin/academics/assessments).",
            "Add a new assessment specifying the class, subject, year, term, assessment type, and maximum score.",
            "Click the assessment to enter its scores. Term results are usually entered on the Class result sheet instead."
          ]
        },
        {
          id: LEARN.assignments,
          name: "Assignments and Classwork",
          page: { href: "/admin/academics/assignments", label: "Assignments & classwork" },
          steps: [
            "Open Academics > Assignments & classwork (/admin/academics/assignments) and pick the class. Teachers see the classes and subjects they teach; class teachers can also set general work with no subject.",
            "Under 'Set new work', choose the subject, Assignment or Classwork, a title, the instructions, the due date and time, and the total marks. Untick 'Accept work handed in after the due date' to close it at the due time. Pupils and parents see it on the portal straight away.",
            "Open the work to add a worksheet (a PDF, Word file or photo) and change the details at any time.",
            "Pupils hand in on the portal by typing an answer, taking a photo of their exercise book, or uploading a file. They can change it until you mark it. Work handed in after the due date shows as 'Handed in late'.",
            "To mark: open the work. Each pupil shows what they handed in (tap a photo to see it full size). Type the mark and a comment for each one, then click 'Save marks' once. You can also mark work handed in on paper. Pupils and parents see the mark and comment as soon as you save, and a marked piece can no longer be changed by the pupil.",
            "Send the marks to the result sheet: choose the subject's result sheet column and click 'Send marks'. Each mark is scaled to the column's total (15/20 into a 10-mark column gives 7.5). A sheet that is submitted as final or published won't change, and every change is kept in the results history.",
            "Pupils' files are private: only the pupil, their parents and the teachers of that class and subject can open them."
          ]
        },
        {
          id: LEARN.lessonNotes,
          name: "Lesson Notes",
          page: { href: "/admin/academics/lesson-notes", label: "Lesson notes" },
          steps: [
            "Open Academics > Lesson notes (/admin/academics/lesson-notes) and pick the class and term. Notes are listed by week, with Published and Draft counts and how many weeks have notes. Teachers see the classes and subjects they teach; class teachers can also add general notes with no subject.",
            "Under 'New lesson note', choose the subject, the week (this week is chosen for you) and the topic, then click 'Create and add the notes'. The note is saved as a draft: only staff can see it.",
            "On the note's page, upload the file you prepared (PDF, Word, PowerPoint, Excel or a picture, up to 20 MB) and/or type the notes. Click 'Save draft' to keep working on it later, or 'Save and publish' when it's ready.",
            "Once published, pupils and parents of the class see it on the portal under Lesson notes, marked 'New' for a week. They can search by subject, week or topic, open it, and download it for revision.",
            "To update a note, open it, change the text, or remove the file (×) and upload the new one, then save. Pupils see the change straight away. 'Take back to draft' hides it from pupils and parents; 'Delete lesson note' removes it and its file for good.",
            "Admins (and the head) can open any class to see which notes have been prepared and published, and by whom.",
            "Files are private: only the class's teachers, admins, and the pupils and parents of that class (once published) can open them, through links that last 10 minutes."
          ]
        },
        {
          id: LEARN.onlineClasses,
          name: "Online Classes",
          page: { href: "/admin/academics/online-classes", label: "Online classes" },
          steps: [
            "Create the meeting in Zoom, Google Meet or Microsoft Teams first and copy its link (it starts with https://).",
            "Open Academics > Online classes (/admin/academics/online-classes), pick the class, and fill in 'Schedule an online class': subject, topic, date, start time, how long it lasts, the meeting link and passcode, what pupils should prepare, and (optional) a published lesson note to go with it.",
            "Pupils and parents of the class see it on the portal straight away, under Coming up. From 15 minutes before the start it moves to the top with a Join button. Use 'Open the meeting' on the class's page to start it yourself.",
            "To reschedule, open the class and change the date or time; pupils see the new time. 'Cancel class' needs a short reason that pupils and parents see; 'It's on again' undoes it. Delete removes it and its attendance.",
            "Attendance: when a pupil (or a parent, for a young child) taps Join on the portal, the time is recorded. After the class, open it: everyone who joined is filled in as Present and the rest as Absent. Change any that are wrong (e.g. Late) and click 'Save attendance'.",
            "The class's page shows who is expected (every pupil in the class) and who has joined so far while it's running."
          ]
        }
      ]
    }
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Help"
        title="Learn Centre"
        description="Step-by-step guides for everyday school work: results, welfare, report cards, fees, exams and messages. Every page in the dashboard has a 'How this works' link that opens its guide here."
      />

      <LearnSearch total={categories.reduce((n, c) => n + c.guides.length, 0)} />

      {/* Category directory */}
      <nav aria-label="Guide categories" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" data-learn-hide-when-searching>
        {categories.map((cat, idx) => (
          <a
            key={idx}
            href={`#learn-${idx}`}
            className="group flex flex-col rounded-2xl border border-slate-200/80 bg-white p-4 shadow-card transition hover:-translate-y-0.5 active:scale-[0.99] hover:border-brand-green-200 hover:shadow-lift"
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
          <section key={idx} id={`learn-${idx}`} aria-labelledby={`learn-${idx}-title`} className="scroll-mt-24" data-learn-section>
            <div className="mb-4 flex items-center gap-3">
              <span className={cn("inline-flex h-9 w-9 items-center justify-center rounded-xl", toneStyles[cat.tone].icon)}>
                <cat.icon className="h-[18px] w-[18px]" aria-hidden="true" />
              </span>
              <h2 id={`learn-${idx}-title`} className="text-lg font-semibold text-slate-900">
                {cat.title}
              </h2>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {cat.guides.map((guide: Guide) => (
                <div key={guide.id} id={guide.id} data-learn-guide className="scroll-mt-24 rounded-2xl target:ring-2 target:ring-brand-green-400/50">
                  <Card className="flex h-full flex-col">
                    <CardHeader
                      title={guide.name}
                      action={guide.adminOnly ? <Badge tone="slate">Admins</Badge> : undefined}
                    />
                    <ol className="flex-1 space-y-3 px-5 py-5 sm:px-6">
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
                    <div className="border-t border-slate-100 px-5 py-3 sm:px-6">
                      <Link
                        href={guide.page.href}
                        className="group inline-flex items-center gap-1.5 text-sm font-semibold text-brand-green-700 hover:underline"
                      >
                        Open {guide.page.label}
                        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden="true" />
                      </Link>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
