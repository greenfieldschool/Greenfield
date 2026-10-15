import Link from "next/link";

export default function AdminLearnCentrePage() {
  const categories = [
    {
      title: "Core Student Lifecycle",
      color: "border-blue-200 bg-blue-50/20",
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
            "Use the amber link at the top of the Classes page to find current students who have no class yet."
          ]
        }
      ]
    },
    {
      title: "Examination & Assessment Lifecycle",
      color: "border-purple-200 bg-purple-50/20",
      guides: [
        {
          name: "Creating Tests & Setting Up Questions",
          steps: [
            "Go to Operations > Exams > Tests (/admin/exams/tests).",
            "Create a new test with its name, subject, duration (minutes) and the number of objective and theory questions you plan to set (e.g. 30 and 5).",
            "You are taken straight to the test, where a tracker shows how many questions are still left to set. The Tests list shows 'set / planned' for every test.",
            "Use 'Edit test name and duration' on the test page to change the time allowed later.",
            "Configure question types (MCQ single/multi, true/false, fill-blank, essay) and points/marks.",
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
      color: "border-emerald-200 bg-emerald-50/20",
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
          name: "Entering Term Results (Result sheet)",
          steps: [
            "Open Academics > Result sheet (/admin/academics/results).",
            "Pick the class first. The Subject list then shows only that class's subjects (or all subjects if none are assigned yet), then pick the term and click 'Open sheet'.",
            "Enter 1st CA, 2nd CA, Exam (Objective) and Exam (Theory) scores and click 'Save all scores'. Leave a box empty to clear it.",
            "Use 'Copy CBT scores' to bring in objective scores from a computer-based exam session for the class.",
            "Use the subject links under the picker to move to the class's next subject without re-selecting everything.",
            "When every subject is done, click 'Publish results' so students and parents can see them."
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
            "Open Academics > Config (/admin/academics/config).",
            "Set weight allocations (e.g. exams vs. weekly tests) per school level (creche, primary, secondary). Active weights must total 100%.",
            "Configure Grading scale thresholds (e.g. A = 70 to 100) per level."
          ]
        }
      ]
    },
    {
      title: "Finance",
      color: "border-amber-200 bg-amber-50/20",
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
      color: "border-indigo-200 bg-indigo-50/20",
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

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="text-sm font-semibold text-slate-500">Knowledge Base</div>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Admin Learn Centre</h1>
        <p className="mt-2 text-sm text-slate-600">
          A scalable documentation directory for managing the school&apos;s operational lifecycle, grading scales, admissions, examinations, and subjects.
        </p>
      </div>

      {/* Guide Directory */}
      <div className="space-y-6">
        {categories.map((cat, idx) => (
          <div key={idx} className={`rounded-3xl border p-6 shadow-sm ${cat.color}`}>
            <h2 className="text-xl font-bold text-slate-900 mb-4">{cat.title}</h2>
            <div className="grid gap-6 md:grid-cols-2">
              {cat.guides.map((guide, gIdx) => (
                <div key={gIdx} className="rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm">
                  <h3 className="text-md font-semibold text-slate-900 mb-3">{guide.name}</h3>
                  <ol className="space-y-2">
                    {guide.steps.map((step, sIdx) => (
                      <li key={sIdx} className="text-xs text-slate-700 flex gap-2.5 leading-relaxed">
                        <span className="font-bold text-brand-green">{sIdx + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Quick Links */}
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Quick Shortcuts</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/admin/students" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Student List
          </Link>
          <Link href="/admin/students/applications" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Admissions Applications
          </Link>
          <Link href="/admin/finance/fees/academic-years" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Academic Calendar
          </Link>
          <Link href="/admin/academics/config" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Grading Scales
          </Link>
          <Link href="/admin/academics/subjects" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Subject Management
          </Link>
          <Link href="/admin/exams/tests" className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100">
            Exams & Tests
          </Link>
        </div>
      </div>
    </div>
  );
}
