// Anchors on the parent / pupil help page (/portal/help#<id>). Portal pages link to them with
// <PortalPageHeader help={HELP.x} />; a typo is a type error instead of a link that goes nowhere.
export const HELP = {
  fees: "fees",
  writeDescription: "write-description",
  paidNotShowing: "paid-not-showing",
  reportCards: "report-cards",
  reportHeld: "report-held",
  finalScore: "final-score",
  welfare: "welfare-score",
  certificates: "certificates",
  attendance: "attendance",
  behaviour: "behaviour",
  health: "health",
  messages: "messages",
  exams: "exams",
  account: "account"
} as const;

export type PortalHelp = (typeof HELP)[keyof typeof HELP];

export const helpHref = (id: PortalHelp) => `/portal/help#${id}`;
