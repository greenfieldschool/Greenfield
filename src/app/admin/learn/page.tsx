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
      title: "Learners, Parents & Staff",
      icon: GraduationCap,
      tone: "blue",
      guides: [
        {
          id: LEARN.gettingStarted,
          name: "Getting Around the Staff Dashboard",
          page: { href: "/admin", label: "Dashboard" },
          steps: [
            "The Dashboard (the first page after you sign in) shows today at a glance: current learners and classes, applications to review, exams open now, today's attendance, and for admins the money collected this month and fees outstanding. The buttons at the top go straight to the most common jobs.",
            "The menu on the left (the ☰ button on a phone) groups the pages by area. You only see the pages your role can open; admins see everything. The line at the top of each page shows where you are and takes you back up a level.",
            "Most pages have a 'How this works' link under the title. It opens the matching guide here. Every page that applies a school rule has a 'School policy' link that opens that part of the policy.",
            "After you save, a short message at the top right says what happened, or what to fix. Nothing you type is lost when something needs fixing.",
            "Search this Learn Centre with the box at the top. Guides marked 'Admins' are for admins only.",
            "Sign out from the menu under your name (top right) when you use a shared computer."
          ]
        },
        {
          id: LEARN.profile,
          name: "Your Profile, Password and Signature",
          page: { href: "/admin/profile", label: "My profile" },
          steps: [
            "Open My profile from the menu under your name. Add a profile photo (drag it in or upload) and check your name: it appears on messages, records you change and the histories other staff see.",
            "Draw your signature once under 'Your signature'. Class teachers' signatures go on their own classes' certificates. An admin chooses whose signature goes on the head teacher's line under Settings.",
            "To change your password, open Change password from the same menu. Choose one you don't use anywhere else. If you've forgotten it, ask an admin: on Staff & users they can make a one-time sign-in link for you. Sign in with it, then choose a new password here. Nobody can see your password.",
            "Turn emails about messages, spending requests or exam questions on or off with the 'Stop these emails' link in any of those emails, or in Messages → Settings for message emails."
          ]
        },
        {
          id: LEARN.careers,
          name: "Job Posts and Job Applications",
          page: { href: "/admin/careers", label: "Job posts" },
          adminOnly: true,
          steps: [
            "Careers → Job posts lists the jobs on the website's Careers page. 'New job' opens a form: title, summary, location, employment type, who it reports to and pay (optional), responsibilities and requirements (one per line), and how to apply (email, link or WhatsApp).",
            "The web address of a job comes from its Slug (for example 'class-teacher-primary'). Keep it short; changing it later breaks links people have shared.",
            "A job shows on the website only once it is published. Unpublish it when the post is filled; it stays here for next time.",
            "Careers → Job applications lists everyone who applied on the website, newest first. Open one to read it and download the CV. Applications hold personal details: don't forward them outside the school."
          ]
        },
        {
          id: LEARN.policies,
          name: "School Policies (reading them, where they show, changing them)",
          page: { href: "/admin/policies", label: "School policies" },
          steps: [
            "Open School policies in the menu. The Staff policy tab is the policy for everyone who works here (parents and learners can never see it); Parents and learners is the policy families read on the portal. Both can be printed.",
            "Pages where a rule applies have a 'School policy: …' link that opens that part of the policy in a pop-up: for example Discipline (when a rule is broken) and Applications (documents needed for admission). Families see the same boxes on the portal.",
            "A new version stays a draft until the Proprietress approves it. While it is a draft, staff can read it here but families see 'The school policy is being updated' on the portal.",
            "To change a policy, an admin writes the change down and the Proprietress approves it; the developers then update the text and the version, so every page shows the same words. Admins see ideas for the next review under Suggested changes."
          ]
        },
        {
          id: LEARN.admissions,
          name: "Admissions & Enrollment Workflow",
          page: { href: "/admin/students/applications", label: "Learner applications" },
          adminOnly: true,
          steps: [
            "Families apply online with the admission form on the school website (/apply).",
            "Open Core > Learner applications (/admin/students/applications) to see applications waiting for a decision.",
            "Before approving, check the 'Might already be at the school' box on the application: it lists learners with the same or a similar name, the same date of birth, or the same parent phone or email. If it is the same child, open their record instead of approving.",
            "Clicking 'Approve' adds the child to the Learners list as enrolled and gives them the next admission number automatically (Accounts & passwords → Number format).",
            "The child's level (creche, primary, secondary) follows the class you choose, e.g. Playgroup is primary."
          ]
        },
        {
          id: LEARN.addPupil,
          name: "Adding a Learner (new, or from another portal)",
          page: { href: "/admin/students/new", label: "Add a learner" },
          steps: [
            "Families who apply online come in through Applications. For a child the office registers directly, or one moving over from the old portal, use Learners → Add a learner.",
            "Type the name and date of birth first. As you type, the page checks for the same child already on the system (same or similar name, same date of birth, same parent phone or email) and offers 'Open this record' so nobody is entered twice.",
            "Admission number: leave 'Give the next number' chosen and the school's next number is used. For a learner from another portal choose 'Keep their existing number' and type it; the page tells you at once if another learner already has it, in any spelling (GRE/2026/7 and gre 2026 007 count as the same).",
            "If the child really is a different person with a similar name, tick 'This is a different child' and save. That choice is recorded with your name."
          ]
        },
        {
          id: LEARN.studentAccounts,
          name: "Learner Portal Accounts (Sign-in)",
          page: { href: "/admin/accounts", label: "Accounts & passwords" },
          adminOnly: true,
          steps: [
            "Learners sign in at the portal with their admission number and a password. Accounts are made on Accounts & passwords (People menu), one at a time or a whole class at once.",
            "If a learner's admission number is changed on their page, their sign-in changes with it. Their password stays the same.",
            "Lost slip: an admin can look the school's temporary password up again until the end of term. Forgotten own password: give a new temporary one on Accounts & passwords or on the learner's page (nobody can see a password the learner chose)."
          ]
        },
        {
          id: LEARN.accounts,
          name: "Accounts & Passwords (learners and parents)",
          page: { href: "/admin/accounts", label: "Accounts & passwords" },
          adminOnly: true,
          steps: [
            "Open People → Accounts & passwords. The Learners tab lists every learner on roll with their admission number, whether they have a portal account and when they last signed in. The Parents tab does the same for parents (they sign in with their email). Click a name to open the record; the record links back here.",
            "Use the chips (No account, Never signed in, No number) and the class box to narrow the list, tick the people you want (or 'Choose all'), then press Create accounts or Reset passwords. Up to 40 are done per press; if you chose more, press again to continue.",
            "The new temporary passwords appear in a box at the top, with the date each works until (the end of term). Press 'Print login slips' to print one slip per person (two across an A4 page, with cut lines), or 'Copy all'.",
            "A family lost the slip? Until the end of term an admin can look the temporary password up again: tick the person (the 'Still on school password' chip lists them) and press 'Show passwords', or use 'Show temporary password' on the learner's or parent's page. Every look-up is recorded in History with your name.",
            "Each person is asked to choose their own password when they sign in. Once they do, the school's copy is deleted and nobody, not even admins, can see their password: give a new temporary one if they forget it. At the end of term anyone still on a school password must choose their own the next time they sign in.",
            "Learners without an admission number can't have an account. The gold box offers 'Give them numbers': numbers follow the school's format, oldest record first.",
            "No owner lists sign-ins that aren't linked to anybody (often an account made twice). Type the learner's admission number or the parent's email and press Link.",
            "Number format: the school uses GRE/{YYYY}/{N}, for example GRE/2026/007. The year is the year the school session started, so a learner who joins in January 2027 (2026/27 session) gets 2026. The running number starts again at 001 each session. New numbers always start after the highest one already used, so they never repeat. Only the developers can change the format: on the Number format tab press 'Ask for a change', fill in the new format and say why, and send it. It shows as 'Waiting for the developers' until they approve or turn it down (you can withdraw it meanwhile). Changing the format never changes existing numbers.",
            "If two learners already share a number, a red box at the top lists them. Give one a new number (or deactivate the duplicate).",
            "History shows every number given or changed, account created, password reset and link made, with who did it and when."
          ]
        },
        {
          id: LEARN.deactivatePupils,
          name: "Deactivating a Learner (duplicates, test records, leavers)",
          page: { href: "/admin/students", label: "Learners" },
          adminOnly: true,
          steps: [
            "Open the learner's page from Learners and scroll to 'Deactivate learner' (admins only). Choose the reason from the list: Duplicate record, Test or dummy record, Left the school, Moved to another school, Graduated, or Other. Only Other asks you to type the reason.",
            "Duplicate record: choose the record to keep (records with the same name are listed first). The duplicate's parents are also linked to the record kept, so no family loses access. The duplicate's results and fees are NOT moved, because results are locked once final; it keeps them and is simply hidden.",
            "Duplicates, test records and Other are taken out of their class, so they no longer appear on class lists, registers, result sheets or report cards, and parents no longer see them in the portal. Left the school, Moved school and Graduated keep their class and records, so past report cards still include them.",
            "Changed your mind? Open the learner (Learners → Status: Deactivated) and press Reactivate: they go back to their class and status.",
            "Only the developers can delete a record permanently. For a duplicate or test record with nothing attached (no results, fees, attendance, exams, welfare …), the learner's page offers 'Ask the developers to delete': type the learner's name and say why. The record stays deactivated (hidden everywhere) until a developer approves or says no; you can withdraw the request meanwhile. If anything is attached it can't be deleted and stays deactivated, which is safe.",
            "Every deactivation, reactivation, delete request and delete is recorded with the reason, the date and who did it: see Learners → Deactivation log. Deleted records stay listed there by name and admission number.",
            "The Status box when editing a learner only offers Applied, Enrolled and Active. Leaving always goes through Deactivate so a reason is recorded."
          ]
        },
        {
          id: LEARN.classHistory,
          name: "Class History and Moving Learners Up at the End of the Session",
          page: { href: "/admin/students/class-history", label: "Class history" },
          adminOnly: true,
          steps: [
            "The school keeps a record of which class each learner was in every term. Past report cards and result sheets use it, so a learner who has moved up still appears on last term's report cards for their old class.",
            "It keeps itself up to date: when a term is made active, every learner on roll is recorded in their class for that term; when you change a learner's class during the term, the term follows; a new learner is recorded in their class.",
            "Once a term is over (its end date has passed) or a class's term results are published, that term is closed for the class: changing a learner's class afterwards counts from the next term and the closed term keeps the old class.",
            "Moving learners up at the end of the session: publish the third term's results (or wait until the term's end date), then change each learner's class, then make the new session's first term active. Either order of the last two works. If you move learners before the third term is closed, correct those terms on the learner's page.",
            "When the record was first filled in from past scores, registers and report cards, some learners showed up in two classes in the same term. They are listed under Learners → Class history → Needs checking. Choose the class they were really in and press Save; nothing else about their results is changed.",
            "To correct one learner, open their page: the Class history card lists each term with how it was set and by whom. Use 'Correct a term' (admins only).",
            "Every change is listed under Learners → Class history → Recent changes, with the date and who made it."
          ]
        },
        {
          id: LEARN.classes,
          name: "Checking a Class and Fixing Wrong Registrations",
          page: { href: "/admin/classes", label: "Classes" },
          steps: [
            "Open Core > Classes (/admin/classes) to see every class and how many current learners it has.",
            "Click a class to list its children. Admins can correct the name, admission number, class or status (Applied, Enrolled, Active) on a row and press 'Save'. To mark a child as left, graduated or a duplicate, use Deactivate on the child's own page so the reason is recorded.",
            "Changing the class moves the child to that class (their level follows the new class).",
            "Use the notice at the top of the Classes page to find current learners who have no class yet.",
            "Classes registered twice (e.g. 'Reception' and 'RECEPTION', or 'Year 1' and 'YEAR1') are listed under 'Classes registered twice' at the top of the Classes page, with the one that has the most learners marked 'Keep'. Press 'Merge into …' on the duplicate: its learners, results, attendance, fees, exam sessions, subjects and teachers move to the class you keep, then it is deleted.",
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
            "Open the guardian and use 'Link a learner' to connect each of their children, with the relationship (mother, father, guardian …). A child can have several guardians and each one sees the child in the portal.",
            "Under 'Portal access', create the account with a first password and give it to the parent privately (it can be printed). Parents can't reset their own password: reset it here when they forget. To do many parents at once, or print login slips, use People → Accounts & passwords → Parents.",
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
            "Open Core > Staff & users (/admin/users). Invite a member of staff by email with their role: Teacher, Front desk or Nurse (a super admin can also choose Admin or Super admin). They get an email to set their password.",
            "No email? Use 'Generate login link' to make a one-time sign-in link and send it to that person only. Anyone with the link can sign in as them.",
            "Change a person's role from the list. You only see the roles you are allowed to give, and you can't change your own role. 'Roles and what each can do' below explains each role and who can give it.",
            "After giving someone the Teacher role, assign their classes and subjects under Academics > Teacher assignments, or they will see no classes.",
            "Every role change is recorded under 'Recent role changes' on the same page: whose account, from which role to which, who changed it and when. The record can't be edited or deleted."
          ]
        },
        {
          id: LEARN.roles,
          name: "Roles and What Each Can Do",
          page: { href: "/admin/users", label: "Staff & users" },
          adminOnly: true,
          steps: [
            "Super admin: everything an admin can do. Only a super admin can make someone an admin or super admin, or take that role away. The school always keeps at least one super admin: the last one can't be demoted.",
            "Admin: the whole staff dashboard, including the sections only admins can open: Staff & users, Announcements, Finance, Settings, Subjects, Class subjects, Teacher assignments, Welfare criteria, Compulsory weeks, Message moderation and Job posts. Admins work on every class. They can give the roles Teacher, Front desk, Nurse, Parent and Learner, but can't change the role of an admin or super admin.",
            "Teacher: the staff dashboard without the admin-only sections, and only for their own classes. A class teacher sees their whole class and all its subjects; a subject teacher sees only the subjects they are assigned in that class (set under Academics > Teacher assignments). Teachers can message the parents of their classes.",
            "Front desk and Nurse: the staff dashboard without the admin-only sections. They are not limited to particular classes: they can see every class's learners, attendance, welfare and health records. They can't open result sheets, report cards, correction requests or results history, and can't publish results: only admins and teachers work on results. Front desk can still read Published results. Neither can see exam questions, but both can run an exam room (unlock learners, add time). Front desk answers parents' messages to the school office (and sees no other messages); the nurse doesn't use Messages.",
            "Parent: the parent portal only (/portal), for the children linked to them under Core > Guardians. Everyone who signs up on the website starts as a parent.",
            "Learner: the learner portal only, for their own record once their account is linked to them (Core > Learners, or 'Learner link' on Staff & users).",
            "Staff who open the portal are sent to the dashboard, and parents and learners can't open the dashboard. Exam conductors (/conductor) are open to staff and to accounts linked to a conductor.",
            "Changing roles: nobody can change their own role, so ask another admin. Every role change is recorded on Staff & users. If a section you need is missing from your menu, ask an admin whether your role is right."
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
            "Create a new test with its name, subject, term, duration (minutes) and the number of objective and theory questions you plan to set. The policy's format is 30 objective and 5 theory questions for primary, and 50 or more objective and 5 theory (learners answer 3) for secondary.",
            "Each teacher's papers are private: only the teacher who set a test, and the admins, can see, change or schedule it, even when two teachers share a subject. Front desk and the nurse can't see questions. An admin can hand a paper to another teacher under 'Teacher who owns this paper' in the test's Approval box.",
            "When the questions are ready, open 'Approval' at the top of the test and press 'Send for approval'. They are due on Friday of week 2 of the term; the test shows 'Sent on time', 'Sent late' or 'Overdue'. The checks there show whether the paper matches the policy's format, which questions have no correct answer (for example 'Q10 and Q20'), and which are worded like a question in another paper ('Q20 is like Q30 in Year 1 Maths'). Similar questions are only a reminder: two classes studying the same topic can have them.",
            "Admins: open tests 'Waiting for approval' (Exams overview or the Tests filter). Press Approve on the list, or open the test to see the checks first. Tick that the questions are about 20% from past work and 80% from this term, and press Approve, or write what needs changing and press 'Send back with comments'. The teacher is emailed either way. Changing an approved test's questions, time or subject puts it back to draft until it is approved again.",
            "Found a mistake after approving? Admins open the test, open 'Found a mistake? Unapprove this paper' under Approval, choose the reason (only 'Other' needs typing) and press 'Unapprove and send back'. The paper shows 'Sent back' with the reason, the teacher is emailed, and the History lists who did it, when and why. Learners can't open it in any session until it is approved again; sessions still to come open by themselves after the new approval. It can't be done while learners are still writing: wait, or use 'Hand in everyone' in the exam room first. If learners have already sat it, their answers, marks and released results are kept, and the questions stay locked, so the teacher uses Duplicate to make a corrected copy and sends that for approval.",
            "You are taken straight to the test, where a tracker shows how many questions are still left to set. The Tests list shows 'set / planned' for every test.",
            "Use 'Edit test name and duration' on the test page to change the time allowed later.",
            "Tests set before planned numbers existed: open the Tests page and press \'Use existing questions\' to fill in each test\'s objective and theory numbers from the questions it already has, or press \'Use these as targets\' on a single test.",
            "To change the number of questions later, open 'Configure question targets' on the test page. This works even after learners have sat the test, because the numbers are only for planning.",
            "Configure question types (MCQ single/multi, true/false, fill-blank, essay) and points/marks.",
            "Add a picture (diagram, map, chart, photo) to a question with the 'Add picture' button under the prompt, or drag the picture onto it. PNG, JPG, WEBP or GIF up to 2 MB. Save the question to keep it. Learners see the picture under the question and can open it full size.",
            "Open the 'Advanced (JSON)' section to modify or reuse structured options and answers."
          ]
        },
        {
          id: LEARN.sessions,
          name: "Scheduling Exam Sessions",
          page: { href: "/admin/exams/sessions", label: "Exam sessions" },
          steps: [
            "Go to Operations > Exams > Sessions (/admin/exams/sessions).",
            "Create a session linking a Test to a Class, Academic Year and Term. A teacher can only schedule their own papers, for classes they teach that subject in; admins can schedule any class. You can set the session 'Open to learners' before the test is approved: learners see it (between its dates) as soon as an admin approves the test, with no second step. The sessions list says 'Waiting for the test's approval' until then.",
            "Pick a Start date and End date (no times needed). Learners in the class see the exam from the start of the start date until the end of the end date; the time allowed comes from the test's duration.",
            "Status 'Open to learners' shows the exam to the class between the dates; 'Draft' hides it. The sessions list shows whether learners can see each session now, or why not.",
            "Every session needs a class: only learners in that class can open it. A paper for two or more classes needs one session for each class. A session with no class is hidden from all learners and marked 'No class' in the list until you choose one.",
            "Two hours after the session's end date, anyone still writing (or who closed the browser and never came back) is handed in automatically with the answers they saved, and marked. Staff can let them back in if that was too early.",
            "Enable 'Requires secret code' only if learners must type a code given in the exam hall.",
            "To change how many objective and theory questions a session's test should have, open the session and use 'Number of questions'. The numbers are saved on the test, so every session using that test shows them.",
            "Learners access scheduled exams via the learner portal (/portal/login/student)."
          ]
        },
        {
          id: LEARN.examRoom,
          name: "Running the Exam Room (Locks, Power Cuts and Extra Time)",
          page: { href: "/admin/exams/sessions", label: "Exam sessions" },
          steps: [
            "Conductors open their session under /conductor; admins and staff use the session's Attempts page. Both show every learner who has started: Writing, Locked (and why) or Handed in, with their time left. The list updates every 10 seconds.",
            "A learner's exam locks if they leave the exam page for 10 seconds or more, or if it is cut off (power cut, lost connection, browser closed). Shorter trips away are still recorded. A locked learner sees 'Your exam is locked', with their answers saved.",
            "Each learner gets the test's full time from when they press Start. Their clock stops while they are away, locked or cut off, so an interruption costs them no time. When it reaches zero their answers are handed in automatically. The session's end date still closes the exam for everyone.",
            "To let one learner back in: open Unlock on their row, choose why (power cut, network, device problem, left the page, or another reason with a note) and press Unlock. Their page opens again by itself and the clock carries on.",
            "After a power cut or network failure: use 'Unlock everyone' at the top, with the reason. Learners who were signed out sign in again with their own login details (admins can look up school-given temporary passwords under Accounts & passwords). Nobody can sign in for a learner.",
            "To give more time: tick 'Add time' on the learners who need it (or choose 'Everyone who hasn't handed in'), pick how many minutes (5 to 30 at a time, up to 2 hours in all) and why: started late, an interruption, agreed extra time for a learner's needs, or another reason with a note. Every unlock and every minute added is recorded with your name and reason.",
            "At the end of the exam: 'Hand in everyone' hands in all learners still writing, with the answers they saved. If nobody presses it, the school does it 2 hours after the session's end date (so an end date set too early can still be moved first).",
            "A hand-in by the school is not final: 'Let back in' on the learner's row (with a reason) lets them carry on with their answers and the time they had, as long as the session is still open (move its end date first if needed). A learner who pressed Submit themselves, or whose time ran out, stays handed in."
          ]
        },
        {
          id: LEARN.conductors,
          name: "Exam Conductors (the invigilators)",
          page: { href: "/admin/exams/conductors", label: "Conductors" },
          steps: [
            "A conductor is the person who supervises an exam in the hall: they unlock learners whose exam locked, add time and hand everyone in at the end. Staff can do all of this already; conductors are for anyone else, or for giving a member of staff a simple room-only view.",
            "Open Exams → Conductors and add the conductor's name, and their email and phone if you have them.",
            "Link the conductor to the sign-in account they will use: choose it from the list next to their name. They need an account first; an admin can create one under Staff & users. A conductor who is not linked can't sign in to the exam room.",
            "Assign conductors to each session: open the session, then 'Conductors', and tick who is supervising. A conductor only sees the sessions they are assigned to.",
            "Conductors sign in at /conductor/login and open their session. There they see who is writing, who is locked and why, and each learner's time left, and can unlock, add time with a reason, hand everyone in, or let back in a learner the school handed in too early. Every action is recorded with their name.",
            "Conductors never see the questions or the answers, and can't change marks."
          ]
        },
        {
          id: LEARN.marking,
          name: "Marking and Reviewing Scores",
          page: { href: "/admin/exams/sessions", label: "Exam sessions" },
          steps: [
            "Open Exams > Sessions, click the session, then 'Attempts' to see every learner's submission.",
            "Objective answers are marked automatically. Open an attempt to mark theory and essay answers by hand.",
            "When marking is done, release the results from the session page ('Attempts & results release'); learners then see them under Exam results in the portal. Use 'Copy CBT scores' on the result sheet to bring the scores into a term result column."
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
            "The Result sheet then only offers that class's subjects, with quick links to switch between them.",
            "Under 'Major subjects', choose the class's two main subjects (for example English and Mathematics) and click 'Save major subjects'. Teachers post a star of the week video for each of them every week."
          ]
        },
        {
          id: LEARN.teachers,
          name: "Assigning Teachers to Classes and Subjects",
          page: { href: "/admin/academics/teachers", label: "Teacher assignments" },
          adminOnly: true,
          steps: [
            "Open Academics > Teacher assignments (/admin/academics/teachers). Teachers must first have the Teacher role under Staff & users.",
            "Class teacher: pick the teacher, choose 'Class teacher' and tick one or more classes (use 'All creche classes' etc. to tick a whole level). They get those classes' learners, attendance and every subject each class takes (set under Class subjects).",
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
            "Open Result management > Class result sheet. Pick the class, subject and term (e.g. RECEPTION · Quantitative Reasoning · 2026/2027 First Term) and click Open sheet. Every learner in the class is listed automatically.",
            "A new sheet opens with 1st CA (20), 2nd CA (20), Exam (Objective) (30) and Exam (Theory) (30), total 100. You can change the columns with Edit columns if a subject is assessed differently.",
            "Enter the 1st and 2nd CA and click Save changes. The exam boxes stay empty. Reopen the same sheet after the exam and enter the Objective and Theory scores: only the boxes you change are saved, so the CA scores are never lost.",
            "Scores above a column's maximum are refused. Each learner's total out of 100 appears with 'so far' until every column is filled; then the grade and remark show (80–100 A Excellent, 70–79 B Very Good, 60–69 C Good, 50–59 D Pass, 0–49 F Fail).",
            "The Class summary shows the class average, highest, lowest and how many learners got each grade. The bottom row shows each column's class average, and the Scores chart shows each learner's CA (blue) and exam (orange) marks.",
            "Bulk upload: download the sheet as a CSV, fill it in Excel, copy the rows and paste them under Bulk upload. Empty cells are left as they are. Single learner results lets you enter or check one learner's scores for every subject at once.",
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
            "Welfare is scored every week, out of 100 per learner. At the end of term the weekly scores are averaged into one welfare score out of 100. The final score on the report card = (academic average + welfare) ÷ 2.",
            "The marks: Attendance 15, Punctuality 10, Uniform & appearance 10, Conduct 15, Politeness & respect 10, Honesty 5, Cooperation & relationship with others 5, Attentiveness & self-control 5, Leadership & responsibility 5, Participation (sports, clubs, crafts) 20 = 100. Admins can change them under Welfare > Welfare criteria, per level.",
            "Attendance, Punctuality, Uniform and Conduct are worked out for each week from that week's attendance, 'late' marks, uniform checks and discipline records, so keep those up to date. The class teacher rates the rest from 1 (Poor) to 5 (Excellent): a 4 on a 10-mark criterion gives 8 marks.",
            "Class teachers open Welfare > Welfare score sheet (/admin/welfare/scores), pick the class and term, and land on this week. Every learner is listed with the criteria across the row; rate them and save the whole class at once. Pick another week from the strip of weeks; each shows whether it is fully scored.",
            "To save time: 'Copy week N into empty boxes' fills each learner's empty boxes with last week's ratings, and 'Fill empty…' under a heading fills that column. Change only what was different, then 'Save week'. Changed boxes are blue until saved; empty ones are gold. You are warned if you leave with unsaved changes.",
            "A week counts towards the term once the learner is rated for it. Weeks with attendance but no ratings are flagged as 'to rate'. If nothing was recorded for a criterion that week (e.g. no uniform check), it is left out and the week is scored out of the rest. Health incidents never reduce the score.",
            "The Term summary tab shows every learner's weekly scores, their term welfare, academic average and final score.",
            "Compulsory weeks (admins): under Welfare > Compulsory weeks (/admin/welfare/weeks), pick the term and tick the weeks every class must fill, for example every week except the mid-term break, then save. 'Make every week compulsory' ticks them all; 'None compulsory' clears them. Those weeks are marked 'Compulsory' on the score sheet, which lists any still to fill, and report cards can't be published until every learner is scored for each of them."
          ]
        },
        {
          id: LEARN.reportCards,
          name: "Report Cards and Publishing",
          page: { href: "/admin/academics/reports", label: "Report cards" },
          steps: [
            "Open Academics > Report cards (/admin/academics/reports) and pick the class and term.",
            "The checklist shows what is missing: subjects not fully scored, learners without welfare ratings, attendance, and comments. Each line links to the page that fixes it.",
            "Final score = (academic average + welfare) ÷ 2. The academic average is the average of all subject totals; welfare is the average of the weekly welfare scores. Positions are ranked on the final score; learners with no scores are not ranked.",
            "Write comments on the Comments page: the class teacher for every learner, the head teacher (admin) after. 'Suggest for blanks' fills in a starting comment from the learner's final score to edit.",
            "Click 'Print all' to print or save all report cards as PDF (one A4 page per learner). 'Hide positions' prints them without positions.",
            "Click 'Publish report cards'. If anything is still missing you are warned first. Parents and learners then see the same report card on the portal and can print it.",
            "Compulsory welfare weeks are the exception: if an admin made weeks compulsory (Welfare > Compulsory weeks) and some learners haven't been scored for one of them, the checklist shows which and publishing is blocked until they are filled, or until an admin un-ticks the week.",
            "Fees first: on the portal, a report card (and its certificates) only opens once the learner's fees for that term and earlier terms are paid. Until then the parent sees a message with the amount owed and a 'Pay fees' button, and the learner is asked to speak to their parent. Admins see who is held on the Report cards page ('Held from parents: fees owed'). Staff can still print report cards from the dashboard."
          ]
        },
        {
          id: LEARN.publishedResults,
          name: "Published Results (archive)",
          page: { href: "/admin/academics/published", label: "Published results" },
          steps: [
            "Open Result management > Published results. It lists every class result that has been published to parents, newest term first.",
            "Who sees what: admins and front desk (admissions) see every class; a class teacher sees their own classes. Subject teachers and the nurse don't see this page. Parents and learners see only their own child's report card on the portal.",
            "Narrow the list by session, term, level or class, or type a learner's name or admission number to find all of their published results.",
            "Click 'View' to see the whole class ranked on the final score, with every subject, the academic average, welfare, final score and grade. 'Print this list' prints it as a broadsheet.",
            "Click 'Report cards' to print the class's report cards (or 'Report card' beside one learner), and 'Excel' to download the class result as a spreadsheet.",
            "When a class's report cards are published, a copy is saved automatically. Past terms then stay exactly as they were published, even after learners move up a class or the grading changes. Results published before copies were kept show 'No saved copy yet'; an admin can click 'Save copies now' to keep them as they are today.",
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
            "Open Messages (/admin/messages for staff, Messages in the parent portal). Who can talk to whom follows enrolment: when a learner moves class, their parents move to the new class's spaces automatically.",
            "Every class has two spaces: Announcements (teachers of the class post, parents read) and the Parents' chat (parents talk to each other; the class teacher and admins can read it, and parents are told so).",
            "Click New for a private message. Teachers can message parents of learners in classes they teach (as class teacher or subject teacher). Parents can message their children's teachers.",
            "Parents can message other parents in the same class only if that parent has switched on 'Let other parents message me' (off by default). They can block anyone. Phone numbers and emails are never shown.",
            "Teachers set when they usually reply under Messages > settings (default Mon–Fri 08:00–16:00). Parents see it, plus the school office number for anything urgent. Messages still arrive at any time; there is no need to reply outside those hours.",
            "School office: parents can tap 'Message the school office' in Messages. The front desk and admins share these conversations under 'School office' (front desk sees nothing else in Messages). Reply within two school days: your reply shows your name and 'School office', the parent is emailed, and the conversation stops showing as unread for everyone else. The office can't start one; admins can still message any parent privately with New.",
            "Everyone gets an email for a new private message or class announcement (at most one per conversation every 2 hours, and not if they've already read it). Change it under Messages > settings."
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
            "Learners have no access to Messages."
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
          id: LEARN.financeOverview,
          name: "Finance at a Glance: Overview and Debtors",
          page: { href: "/admin/finance/debtors", label: "Debtors" },
          adminOnly: true,
          steps: [
            "Finance → Overview shows the totals invoiced, paid and outstanding, recent payments and expenses, with links to each area.",
            "Finance → Debtors answers 'who owes what': the total outstanding, invoiced and paid, and how many learners owe. 'By class' lists each class's invoiced, paid and outstanding amounts; open a class to list its debtors with their parent or guardian.",
            "Use the debtors list to follow up: the parent's name and phone are shown, with a WhatsApp link that opens a ready-written reminder. Before calling, check Payments for anything paid but not yet matched (bank statements and payment IDs).",
            "A learner on a payment plan is not overdue while they keep to the plan's dates. Missed plan payments are listed under Finance → Payment plans, where the default fee is added or waived.",
            "Learners who still owe when report cards are published see their report card held on the portal until fees are paid (Report cards and unpaid fees)."
          ]
        },
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
            "Open Finance > Invoices > New invoice. Choose the guardian it is addressed to, the learner it is for, the year and term, and the due date. The invoice number (e.g. INV-2026-00012) is given automatically.",
            "Always pick the learner and the term. Bank matching uses the learner, and the report-card hold uses the term.",
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
            "Parents and learners only see a published report card (and its certificates) on the portal once the learner's fees are paid: every invoice for that term and earlier terms with nothing left to pay. Voided invoices don't count; invoices for a later term don't hold back this term.",
            "Until then the parent sees 'report card is ready' with the amount owed, a 'Pay fees' button, and a note that bank transfers can take a little while to be recorded. The learner is asked to speak to their parent.",
            "As soon as the payment is recorded (by hand, from the bank statement or an alert), the report card opens on its own. There is nothing else to do.",
            "Admins see who is held on Academics > Report cards: the Publish box counts them and each learner shows 'Held from parents: fees owed'. Staff can still print any report card."
          ]
        },
        {
          id: LEARN.recordingPayments,
          name: "Recording Payments by Learner and Class",
          page: { href: "/admin/finance/payments", label: "Payments" },
          adminOnly: true,
          steps: [
            "Open Finance > Payments > Record payment and pick the Learner — the list is grouped by class. Picking an invoice instead fills in its learner automatically.",
            "The Payments page shows each payment's learner and class. Filter by class and dates to get the total collected for a class; the 'Amount collected per class' table compares classes.",
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
          name: "Correcting a Payment",
          page: { href: "/admin/finance/payments", label: "Payments" },
          adminOnly: true,
          steps: [
            "A recorded payment is never changed or deleted. This is how auditors expect money records to be kept. Open Finance > Payments and press Open on the payment.",
            "The reference and notes can be changed at any time with 'Save reference and notes'. The amount, date, learner, parent and method are fixed once recorded.",
            "Wrong amount, wrong learner, wrong date, recorded twice, or the bank reversed it: under 'Reverse this payment' choose why (only Other needs typing) and press Reverse payment. It stays on the list crossed out as Reversed, with your name and the reason, and stops counting towards any balance.",
            "Then press 'Enter the correct payment'. The form starts from the reversed payment's details; change what was wrong and record it. The new payment links back to the reversed one. A payment matched from the bank goes back to the bank inbox instead, to match to the right learner.",
            "Right learner but wrong invoice (e.g. meant for second term): use 'Move to another invoice' and say why. The invoice is paid up to what it still owes; anything over is kept as paid in advance.",
            "Every step shows in the payment's History with who did it and when. Only admins can see or record payments."
          ]
        },
        {
          id: LEARN.paymentPlans,
          name: "Payment Plans, Default Fees and Early Payment Discounts",
          page: { href: "/admin/finance/payment-plans", label: "Payment plans" },
          adminOnly: true,
          steps: [
            "A plan splits one invoice into 2 to 5 payments, with the percentages and dates from the school policy (for example 40% on the first day, 30% by Friday of week 4, 30% by Friday of week 8). The term needs start and end dates under Fee setup > Academic years.",
            "Parents can choose a plan on the portal (Fees & billing > Pay in instalments) up to the first day of term, by typing their name. For a paper agreement, open the invoice, choose the plan under Payment plan, type the parent's name, tick that they signed, and save. The parent is told on the portal.",
            "Payment plans lists missed payments the day after each due date. Check the bank first: if the money came in on time but isn't recorded, record it and the payment drops off the list. Otherwise tick it and press Add default fees: the fee (the higher of ₦2,500 or 3% of the term's fees) goes on the invoice, and the parent gets a portal notice, an email and a default letter you can print.",
            "To waive a fee instead, open the invoice and use Waive it with a reason. A fee added by mistake is removed the same way (Remove this fee). Nothing is deleted: every step is kept with who did it.",
            "Early payment discount: mark the tuition fee types under Revenue categories first. On the invoice, the app shows each option with whether the money arrived in time; for 'two weeks before the term' it checks the dates itself. For the advance options, type which payment it was. Discounts don't apply to invoices on a plan."
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
            "Pick the year and term to compare spending term by term. Budget sectors are set up under Fee setup > Budget sectors.",
            "Spending requests add their receipts here by themselves when they close (with a link back to the request), so don't type those again.",
            "A mistake is never deleted: open Void on the row, choose why, and it stays on record crossed out. Records that came from a spending request are corrected by the developers so the request stays right."
          ]
        },
        {
          id: LEARN.spending,
          name: "Spending Requests (asking for money, approving, paying, receipts)",
          page: { href: "/admin/spending", label: "Spending requests" },
          steps: [
            "Anyone on staff: open Spending requests > Ask for money. Choose Advance (money before you buy), Pay a supplier (the school pays the seller; add their invoice or quote) or Pay me back (add your receipt). Pick the category, type the amount and what it's for, and give the bank account. The bank's name for the account is checked with the bank.",
            "Approvers get an email and a count on the menu. Open the request, look at anything flagged (new bank details, possible split purchase, over budget) and Approve, Send back (with what to change) or Decline (with a reason). Requests above the two-approval amount need two approvers; the last must have a limit that covers the amount. Nobody can approve their own request.",
            "The cashier pays approved requests from the Paystack expenses wallet: press Pay through Paystack and type the code sent to the business phone. If Paystack is down or not connected, pay from the bank app, in cash or by POS and record it with the reference and a photo of the slip. Someone who approved a request can only pay it if it's small, and must say why.",
            "Advances: add a photo of each receipt (or choose why there isn't one, e.g. a keke fare), hand any change to the cashier, and press Send for checking. Receipts plus change must equal what you were paid. Reminders start two days before the due date; an overdue advance stops you getting a new one, and the cashier and approvers are told after 3 days.",
            "The cashier (or an approver) checks the receipts and accepts, which closes the request and turns each receipt into an expense record, so it's counted once in Expenses and the management pack. Or they send it back with a reason.",
            "Super admins choose who can approve (and up to how much) and who can pay out under Who approves; every change is recorded. Cashiers record each top-up of the wallet on the Wallet page and compare its list with Paystack's.",
            "Nothing is ever deleted: requests are cancelled with a reason, and every step shows in the request's History with who did it and when. You can switch the emails off at the bottom of the Spending requests page."
          ]
        },
        {
          id: LEARN.paystackWallet,
          name: "The Paystack Expenses Wallet (setting it up and topping it up)",
          page: { href: "/admin/spending/wallet", label: "Expenses wallet" },
          adminOnly: true,
          steps: [
            "What it is: expense payments go out of the Paystack balance of the company the school works with (U Estate), not the school's main account. Only the money moved into that balance can be spent from the app, and every payment still needs an approval and a code from the business phone.",
            "First, protect the account: in Paystack, click the red 'Setup 2FA' banner and turn on two-step sign-in. Everyone who signs in to that Paystack account should do the same.",
            "Check the activation status at the top of the Paystack dashboard. 'Pre-Approved' means Paystack is still checking the business and may pause payouts; reply quickly to any email from Paystack (reviews@paystack.com) until it says 'Approved'.",
            "Switch on transfers: payouts only work when 'Transfers' (with 'Balance') appears in Paystack's left menu, and only for a Registered Business. If it isn't there, open Settings and check the business type is Registered Business (upgrade with the CAC documents if it says Starter). If it is already Registered, press Support (bottom right) and ask Paystack to enable Transfers from the balance by API for the business, quoting its business ID (shown under the name, top left).",
            "Keep the code check on: in Paystack's Settings, under the transfer preferences, leave 'confirm transfers with OTP' switched on, and make sure the code goes to a phone the bursar or principal holds, never a developer's.",
            "Get the account the school pays into: in Paystack go to Settings > Accounts and create the PT Account (Paystack's top-up account for Nigerian businesses; it's free). It is an ordinary bank account number (Paystack-Titan or Paystack MFB). Money transferred into it from the school's main account tops up the balance within minutes and shows as 'Auto Topup' on Paystack's Balance page.",
            "Each time the school tops up: transfer from the school's main account to the PT Account, then record it here on the Wallet page (amount, date, bank reference). Keep about a week's spending in the wallet, not more.",
            "Each month: compare the Wallet page's top-ups and 'Paid through Paystack' list with Paystack's Balance history. The balance shown here is the company's whole Paystack balance, so compare the lists, not just the total.",
            "You don't need Subaccounts or Transaction Splits for this: they split money customers pay in. If the company already has a webhook set in Settings > API Keys & Webhooks, leave it; payments still finish and record through the code step and 'Check with Paystack'.",
            "Test once transfers are on: the balance appears on this page; then ask for a small amount (e.g. ₦100) as a Pay me back request, approve it, and pay it through Paystack to see the whole flow work."
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
            "Everyone starts as Present: change the learners who were absent, late or excused, then click 'Save register' once for the whole class. The strip of days shows which days of the week are taken and which are not.",
            "Attendance feeds the weekly welfare score: Attendance = days present ÷ days taken that week, Punctuality = days on time ÷ days present. Report cards show 'present X of Y days'."
          ]
        },
        {
          id: LEARN.welfareRecords,
          name: "Uniform Checks, Discipline and Health Notes",
          page: { href: "/admin/welfare/uniform", label: "Uniform checks" },
          steps: [
            "These records feed the weekly welfare score on their own, in the week they happen: uniform checks give Uniform & appearance, discipline records take marks off Conduct. Health notes never affect any score.",
            "Uniform checks (Welfare > Uniform): pick the class and the day. Everyone starts as Neat: mark the learners whose uniform wasn't right (with a note if you like) and click 'Save uniform check' once. You don't have to check every day. The week's mark = checks passed ÷ checks done; with no checks that week, Uniform is left out and the week is scored out of the rest. 'Remove this day's check' undoes a day saved by mistake.",
            "Discipline (Welfare > Discipline): see 'The discipline ladder' below. Conduct starts full every week; each case takes off its seriousness × the penalty for the level (1 mark per point unless an admin changes it under Welfare criteria). The day it happened decides which week it counts in.",
            "From the welfare score sheet: the 'This week's records' box shows what is missing for that week, and its buttons open these pages on the class and week, with 'Back to the welfare score sheet' at the top. The sheet's four record columns (Attendance, Punctuality, Uniform, Conduct) can't be typed on the sheet itself: they always come from these records.",
            "Health & incidents (Welfare > Health & incidents): sickness, injuries and other notes, with severity. Click the status to mark it resolved.",
            "Parents see discipline and health records in the portal. Write them in plain, factual words, as you would say them to the parent.",
            "Pick the right term on each record. Records are also matched to the week and term by their date."
          ]
        },
        {
          id: LEARN.disciplineLadder,
          name: "The Discipline Ladder",
          page: { href: "/admin/welfare/discipline", label: "Discipline" },
          steps: [
            "The school policy ('When a rule is broken') counts how many times a learner has broken the same rule, and the correction grows each time. The app does the counting: the count is for each learner and each rule, and it never starts again.",
            "Open Welfare > Discipline and go to 'Record a case'. Pick the learner and the rule broken. The form then says which time it is (for example 'This will be the 2nd time for this rule') and shows only the corrections the policy allows for that time.",
            "1st time: the learner reads the rule three times, then a firm warning. 2nd time: choose one of 30 minutes of useful work, supervised reflection time with a member of staff, lost break time or a spoken promise. 3rd time: 30 minutes of useful work on 3 days in a row, a counselling session and a written statement for the learner's file. You can add the statement later on the case ('Add the written statement').",
            "Taking what isn't theirs gets 30 minutes of useful work from the 1st time. Behaviour outside school in uniform goes straight to the disciplinary committee.",
            "From the 4th time, the case waits under 'Waiting for the disciplinary committee'. The committee hears the learner first. An admin then records what the learner said, the decision (up to 10 school days with the environment team, supervised and outside lesson time; referral to the school counsellor, with outside support only if the parent agrees; or another measure, explained in the note) and the day the parent is invited in. Only the committee can suspend or expel, always with a letter to the parent. Parents can appeal in writing to the Proprietress. No learner is ever left alone as a correction, and the school never uses corporal punishment.",
            "Write 'What happened' in plain, factual words: parents read it on the portal. Pick how serious it was (1 to 5): this takes marks off Conduct on the welfare score sheet for that week.",
            "Parents are told every time on the portal and by email (and on their phone if they turned alerts on). The alert only says there is a note from school, because it can show on a lock screen. When the committee decides, they are asked to come in on the day you gave. Learners see their own records on the portal but aren't sent alerts.",
            "Made a mistake? 'Withdraw this record' with a reason. You can withdraw your own records on the day you made them; admins can withdraw any. A withdrawn record stops counting on the ladder and the welfare score sheet, and admins keep a copy. Records can't be edited or deleted.",
            "To see one learner's ladder, choose them under 'A learner's ladder': every rule they have broken, how many times, and what the next time would be. Cases recorded before 23 November 2026 have no rule and don't count.",
            "Admins manage the list of rules under Discipline > Rules: add a rule (only ones the policy has), change how the ladder applies to it, or retire it. A retired rule's past cases still count."
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
            "Under 'Set new work', choose the subject, Assignment or Classwork, a title, the instructions, the due date and time, and the total marks. Untick 'Accept work handed in after the due date' to close it at the due time. Learners and parents see it on the portal straight away.",
            "Open the work to add a worksheet (a PDF, Word file or photo) and change the details at any time.",
            "Learners hand in on the portal by typing an answer, taking a photo of their exercise book, or uploading a file. They can change it until you mark it. Work handed in after the due date shows as 'Handed in late'.",
            "To mark: open the work. Each learner shows what they handed in (tap a photo to see it full size). Type the mark and a comment for each one, then click 'Save marks' once. You can also mark work handed in on paper. Learners and parents see the mark and comment as soon as you save, and a marked piece can no longer be changed by the learner.",
            "Send the marks to the result sheet: choose the subject's result sheet column and click 'Send marks'. Each mark is scaled to the column's total (15/20 into a 10-mark column gives 7.5). A sheet that is submitted as final or published won't change, and every change is kept in the results history.",
            "Learners' files are private: only the learner, their parents and the teachers of that class and subject can open them.",
            "Learners and parents get a notification on the portal (the bell) when you set work and when you mark a learner's work (only that learner and their parents). Changing a mark later doesn't send another."
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
            "Once published, learners and parents of the class see it on the portal under Lesson notes, marked 'New' for a week. They can search by subject, week or topic, open it, and download it for revision.",
            "To update a note, open it, change the text, or remove the file (×) and upload the new one, then save. Learners see the change straight away. 'Take back to draft' hides it from learners and parents; 'Delete lesson note' removes it and its file for good.",
            "Admins (and the head) can open any class to see which notes have been prepared and published, and by whom.",
            "Files are private: only the class's teachers, admins, and the learners and parents of that class (once published) can open them, through links that last 10 minutes.",
            "Publishing a note sends learners and parents of the class a notification on the portal (once: taking it back to draft and publishing again the same day doesn't send it twice)."
          ]
        },
        {
          id: LEARN.onlineClasses,
          name: "Online Classes",
          page: { href: "/admin/academics/online-classes", label: "Online classes" },
          steps: [
            "Create the meeting in Zoom, Google Meet or Microsoft Teams first and copy its link (it starts with https://).",
            "Open Academics > Online classes (/admin/academics/online-classes), pick the class, and fill in 'Schedule an online class': subject, topic, date, start time, how long it lasts, the meeting link and passcode, what learners should prepare, and (optional) a published lesson note to go with it.",
            "Learners and parents of the class see it on the portal straight away, under Coming up. From 15 minutes before the start it moves to the top with a Join button. Use 'Open the meeting' on the class's page to start it yourself.",
            "To reschedule, open the class and change the date or time; learners see the new time. 'Cancel class' needs a short reason that learners and parents see; 'It's on again' undoes it. Delete removes it and its attendance.",
            "Attendance: when a learner (or a parent, for a young child) taps Join on the portal, the time is recorded. After the class, open it: everyone who joined is filled in as Present and the rest as Absent. Change any that are wrong (e.g. Late) and click 'Save attendance'.",
            "The class's page shows who is expected (every learner in the class) and who has joined so far while it's running.",
            "Learners and parents get a notification on the portal when you schedule a class, move it to another time (with the old and new time), cancel it (with your reason) or put it back on. Changing only the topic or link doesn't send one."
          ]
        },
        {
          id: LEARN.starVideos,
          name: "Star of the Week Videos",
          page: { href: "/admin/academics/star-videos", label: "Star videos" },
          steps: [
            "Every week, each class shares a short video of a learner who did well in each of its two major subjects. An admin chooses the two subjects on Class subjects ('Major subjects').",
            "Record the video and save it to Google Drive or YouTube (unlisted). Set sharing so anyone with the link can view, or parents won't be able to open it. Then copy the link.",
            "Open Academics > Star videos (/admin/academics/star-videos), pick the class (this week is shown; use the arrows for an earlier week). For each major subject, choose the learner, paste the link, add a sentence on why they're the star, and click 'Post video'.",
            "The page suggests the learners with the best marks on that subject's work marked this week. It's a hint: you choose. The class teacher can post for both subjects; a subject teacher only for their subject.",
            "The learner and their parents get a notification (and an email or phone alert if they have them on) and can watch it under Star videos on the portal. Only that child's family sees it. Choosing a different learner notifies the new learner's family; changing only the link doesn't send another.",
            "Leadership sees every class's videos, with links, in the management pack, and which classes haven't posted yet. 'Remove video' takes it off the portal."
          ]
        },
        {
          id: LEARN.announcements,
          name: "School Announcements",
          page: { href: "/admin/announcements", label: "Announcements" },
          adminOnly: true,
          steps: [
            "Open People > Announcements (/admin/announcements). Write a clear title and the announcement: dates, times, what to bring, who to contact.",
            "Choose who it's for: the whole school, one section (Creche, Primary or Secondary) or one class. Learners and parents of those classes see it on the portal under Announcements, with a notification on the bell.",
            "Tick 'Also email parents' to email it too, from the school's Gmail. Parents who switched announcement emails off don't get one. Emails start going straight away; a free Gmail account sends about 450 a day, so a whole-school announcement to more parents than that finishes the next morning.",
            "Check it before you click 'Send announcement': it can't be unsent or edited. If something was wrong, send a short correction."
          ]
        },
        {
          id: LEARN.familyAlerts,
          name: "What Families Are Told Automatically",
          page: { href: "/admin/announcements", label: "Announcements" },
          steps: [
            "Parents and learners get a notice on the portal (the bell), on their phone if they turned alerts on, and parents also by email. Learners never get email.",
            "Learners and their parents are told when: work is set and when it is marked (assignments and classwork); a lesson note is published; an online class is scheduled, moved, cancelled or back on; a learner is chosen as star of the week.",
            "Parents only are told when: a discipline case is recorded or the disciplinary committee decides (the notice only says 'A note from school about …', so nothing private shows on a phone's lock screen); a payment plan is set up on paper; a default fee is added for a missed plan payment.",
            "By email: a new private message or class announcement (at most one per conversation every two hours, and not if already read), a reply from the school office, and school announcements sent from Announcements.",
            "Staff are emailed about spending requests waiting for them and about their exam questions being approved, sent back or unapproved. Staff get no bell notices; the Messages badge shows unread messages.",
            "Everyone can turn emails off with the link in each email; parents choose under Notifications on the portal."
          ]
        },
        {
          id: LEARN.email,
          name: "Email to Parents (Gmail)",
          page: { href: "/admin/settings#email", label: "Settings → Email" },
          adminOnly: true,
          steps: [
            "The website emails parents from the school's Gmail account (greenfieldschslekki@gmail.com): their portal notifications (new work, marks, lesson notes, online classes), an alert when they get a new message, and school announcements. Learners only get the portal bell.",
            "Message alerts go to whoever receives the message, staff too: at most one per conversation every two hours, never if it's already been read, and they say who wrote, not what. The class parents' chat never sends emails.",
            "Setting up is done once by whoever looks after the website (docs/email-setup.md). Then, in Settings → Email (Gmail), click 'Connect Gmail', sign in as the school account and allow sending. The website can only send; it can't read the mailbox.",
            "Settings → Email shows how many were sent in the last 24 hours (of the daily limit), how many are waiting and how many couldn't be sent. 'Send me a test email' checks it works; 'Reconnect' fixes an expired connection; 'Disconnect' stops all emails (they wait until it's connected again).",
            "Every parent chooses their emails on the portal (Notifications → Email me about) and every email has a 'Stop these emails' link. Staff switch message emails on or off in Messages → Settings.",
            "Staff also get emails about spending requests and about their exam questions (approved or sent back). Until 24 November 2026 message emails were not being sent at all because of a fault; they now are, so staff and parents may notice them for the first time."
          ]
        },
        {
          id: LEARN.managementPack,
          name: "Management Pack (weekly and monthly)",
          page: { href: "/admin/management-pack", label: "Management pack" },
          adminOnly: true,
          steps: [
            "Open Management > Management pack (/admin/management-pack). It opens on this week. Click Monthly for the month, and use the arrows or the list to look at an earlier week or month. Weeks run Monday to Sunday.",
            "Each figure is shown next to the same figure for the period before, with the change. Green means good news, red means it needs a look, grey means neither (for example, more emails sent). While a week or month is still running, it is compared with the same days of the period before (Monday to Wednesday against last Monday to Wednesday), so a half-finished week doesn't look like a fall.",
            "'Worth a look' picks out what stands out: attendance under 90%, a class with low attendance, serious or unresolved incidents, overdue fees, a drop in fees collected, applications or correction requests waiting.",
            "The sections: learners and admissions, attendance, fees and money, welfare and behaviour, teaching and learning, star of the week videos (with a link to each video and which classes haven't posted), staff, and communication. Figures marked 'As of today' (learners on roll, fees still owed) are a count right now and have no comparison.",
            "Heads' actions: what the heads (admin accounts) did in the dashboard to manage learners and staff, counted from the records themselves: incidents and discipline recorded, learners' tests unlocked, star videos, head's report card comments, results published, correction requests decided (and how many hours they took on average), locked result sheets reopened, teachers assigned to classes or subjects, reported messages dealt with, messages and announcements sent, and payments, expenses and invoices recorded. A table shows each head's actions by area. Nothing is typed in: a head's work counts when they do it in the dashboard under their own login.",
            "Staff: how many staff have an account (by role), new staff accounts, teachers with no class or subject (they can't take registers or enter results), and a table of the work each teacher recorded: registers taken, work set, work marked, lesson notes and online classes, least first, with last period's total. Work counts for whoever entered it, so a register an admin took for a class counts for the admin. From the third school day of a week, 'Worth a look' names teachers with a class or subject who have recorded nothing. Staff attendance and leave aren't recorded in the system, so they aren't in the pack.",
            "Inventory (monthly pack only, at the end): items added to the register, counts updated, pieces newly marked damaged or due for replacement, and items deactivated this month compared with last month; the register as at the month's end (items, pieces, damaged, due for replacement, items not counted in 3 months); by section; items deactivated with their reasons; and who updated the inventory. 'Worth a look' points out items deactivated as lost or stolen and pieces due for replacement.",
            "Attendance = learners present or late ÷ learners marked on the registers. 'Registers taken' compares registers marked with every class on every weekday, so public holidays and half-term lower it.",
            "The figures come straight from what staff record: registers, incidents, payments, expenses, assignments and so on. If a figure looks wrong, check that the records were entered (for example, payments recorded or registers taken).",
            "The pack is read only: nothing is typed into it. Every figure comes from what heads, teachers and the office record day to day in the dashboard: registers, payments and expenses, incidents and discipline, assignments and marking, lesson notes, online classes, star videos, applications and staff accounts. To change a figure, correct the record where it was entered.",
            "History: every finished week and month is saved automatically the night after it ends, exactly as the figures stood then, and recent ones that were missed are filled in overnight. Opening a past week or month shows that saved copy (it says when it was kept). Click History to see the saved weeks or months side by side. Saved copies can't be changed or deleted. 'Today's figures' shows a past week worked out again from today's records, for example after late corrections; the saved copy stays as it was.",
            "To share it, click 'Print or save as PDF' and choose 'Save as PDF' as the printer. The menus and buttons are left out of the printout."
          ]
        },
        {
          id: LEARN.inventory,
          name: "Inventory (school assets)",
          page: { href: "/admin/inventory", label: "Inventory" },
          adminOnly: true,
          steps: [
            "Open Management > Inventory (/admin/inventory). It is one register with six sections to start with: Uniforms and school wear, Classroom furniture, Classroom facilities and equipment, Office, Laboratory, and Computers and ICT. Admins only.",
            "Press 'Add item' and choose the section. Each line is one kind of item in one place, e.g. 'Learners' chairs' in Year 2. Pick the item from the usual list or type any other item, choose Primary School, College or Whole school, and the location.",
            "Count how many are New, Good, Fair, Damaged and Due for replacement: the total is added up for you. So '30 chairs, 5 of them broken' is one line, not two. Set 'Last counted on' when you do a stock count.",
            "Add up to 6 pictures per item from a phone or computer. Big photos are made smaller automatically so they stay under the 2MB limit.",
            "'Save and add another' keeps you in the same section, for going round a room quickly.",
            "To change counts later, open the item, change the numbers and save. Every change is kept in the item's History with who made it.",
            "Inventory history (Management > Inventory history) lists every change across the whole inventory, newest first: items added, counts or locations changed (e.g. 'Damaged: 0 → 4'), deactivated (with the reason) or reactivated, and every section, usual item or location added, renamed, hidden or shown again under Sections & locations, always with who did it and when. Filter by section, by what happened, by what it's about (items or the set-up lists), by dates, or search an item or a person, then Print.",
            "Inventory can't be deleted. For an item that is gone or was entered by mistake, open it and use Deactivate: choose the reason from the list (Damaged beyond repair / written off, Lost or missing, Stolen, Sold, Donated or given away, Entered by mistake / duplicate line, or Other, the only one where you type the reason). It stops counting in the register and the report, but the item and its history stay. Tick 'Deactivated' on the register to see them, and use Reactivate if it was a mistake.",
            "Inventory report: totals by section, by part of the school and by location, with how many are in each condition, plus a 'Needs repair or replacing' list for planning and the budget. Filter Primary or College, then 'Print report' (choose 'Save as PDF' to keep a copy).",
            "Sections & locations: add a new section (e.g. Library, Sports store), add items to a section's usual list, add rooms and stores, or untick 'In use' to hide one. Classrooms were added from the class list."
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
