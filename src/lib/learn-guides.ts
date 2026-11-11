// Learn Centre guide anchors (/admin/learn#<id>). Pages link to these with <PageHeader learn={LEARN.x} />, so a
// typo or a removed guide shows up as a type error instead of a link that goes nowhere.
export const LEARN = {
  admissions: "admissions",
  studentAccounts: "student-accounts",
  classes: "classes",
  guardians: "guardians",
  staffAccounts: "staff-accounts",
  roles: "roles",
  tests: "exam-tests",
  sessions: "exam-sessions",
  marking: "exam-marking",
  subjects: "subjects",
  duplicateSubjects: "duplicate-subjects",
  classSubjects: "class-subjects",
  teachers: "assigning-teachers",
  results: "entering-results",
  corrections: "corrections-history",
  resultColumns: "result-columns",
  welfare: "weekly-welfare",
  reportCards: "report-cards",
  publishedResults: "published-results",
  certificates: "certificates",
  calendar: "academic-calendar",
  grading: "grading",
  messages: "messages",
  moderation: "moderation",
  feeSetup: "fee-setup",
  invoices: "invoices",
  feeHold: "unpaid-fees-report-cards",
  recordingPayments: "recording-payments",
  paymentIds: "payment-ids",
  editPayment: "edit-payment",
  expenses: "expenses",
  attendance: "attendance",
  welfareRecords: "welfare-records",
  assessments: "assessments",
  assignments: "assignments",
  lessonNotes: "lesson-notes",
  onlineClasses: "online-classes",
  announcements: "announcements",
  email: "email",
  managementPack: "management-pack",
  starVideos: "star-videos"
} as const;

export type LearnGuide = (typeof LEARN)[keyof typeof LEARN];

export const learnHref = (guide: LearnGuide) => `/admin/learn#${guide}`;
