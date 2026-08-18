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
            "Create a new test specifying name, description, duration (minutes), and subject details.",
            "Click on the newly created test to open the questions editor.",
            "Configure question types (MCQ single/multi, true/false, fill-blank, essay) and points/marks.",
            "Open the 'Advanced (JSON)' section to modify or reuse structured options and answers."
          ]
        },
        {
          name: "Scheduling Exam Sessions",
          steps: [
            "Go to Operations > Exams > Sessions (/admin/exams/sessions).",
            "Create a session linking a Test to a specific Class, Academic Year, and Academic Term.",
            "Provide optional start/end validity windows and enable 'Requires secret code' for secure validation.",
            "Students access scheduled active exams via the student portal (/portal/login/student)."
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
            "Toggle 'Active' to enable selection across tests and class schedules."
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
          A scalable documentation directory for managing the school's operational lifecycle, grading scales, admissions, examinations, and subjects.
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
