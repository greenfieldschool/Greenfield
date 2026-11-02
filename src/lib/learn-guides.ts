// Learn Centre guide anchors (/admin/learn#<id>). Pages link to these with <PageHeader learn={LEARN.x} />, so a
// typo or a removed guide shows up as a type error instead of a link that goes nowhere.
export const LEARN = {
  attendance: "attendance",
  teachers: "assigning-teachers",
  classSubjects: "class-subjects",
  results: "entering-results",
  corrections: "corrections-history",
  grading: "grading",
  welfare: "weekly-welfare",
  reportCards: "report-cards",
  certificates: "certificates",
  recordingPayments: "recording-payments",
  paymentIds: "payment-ids",
  feeHold: "unpaid-fees-report-cards"
} as const;

export type LearnGuide = (typeof LEARN)[keyof typeof LEARN];

export const learnHref = (guide: LearnGuide) => `/admin/learn#${guide}`;
