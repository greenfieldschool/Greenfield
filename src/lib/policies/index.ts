// Server only: this module holds the staff policy, which must never be sent to a parent or pupil's browser.
import "server-only";
import { familiesPolicy } from "./families";
import { staffPolicy } from "./staff";
import type { PolicyAudience, PolicyDoc, PolicyKey, PolicySection, PolicySuggestion } from "./types";

export type { PolicyBlock, PolicyDoc, PolicyKey, PolicySection, PolicyPart, PolicyAudience } from "./types";

export const POLICIES: Record<PolicyKey, PolicyDoc> = { families: familiesPolicy, staff: staffPolicy };

export function isApproved(doc: PolicyDoc) {
  return Boolean(doc.approvedBy && doc.approvedOn);
}

export function findSection(key: PolicyKey, sectionId: string): PolicySection | null {
  for (const part of POLICIES[key].parts) {
    const s = part.sections.find((x) => x.id === sectionId);
    if (s) return s;
  }
  return null;
}

/** The families policy as a pupil sees it: sections marked "parents" are left out. */
export function forReader(doc: PolicyDoc, reader: "parent" | "student" | "staff"): PolicyDoc {
  if (reader !== "student") return doc;
  const keep = (a: PolicyAudience | undefined) => (a ?? "everyone") === "everyone";
  return {
    ...doc,
    parts: doc.parts
      .map((p) => ({ ...p, sections: p.sections.filter((s) => keep(s.audience)) }))
      .filter((p) => p.sections.length > 0)
  };
}

export const portalPolicyHref = (sectionId?: string) => `/portal/policies${sectionId ? `#${sectionId}` : ""}`;
export const adminPolicyHref = (key: PolicyKey, sectionId?: string) =>
  `/admin/policies?doc=${key}${sectionId ? `#${sectionId}` : ""}`;

// Changes proposed for the Proprietress and management to decide. Shown to admins on /admin/policies; remove an
// item once it has been decided (and the policy text changed if it was accepted).
export const POLICY_SUGGESTIONS: PolicySuggestion[] = [
  {
    title: "Money penalties for staff",
    why: "Fines and “2 days' pay” are deductions from wages, which the Labour Act limits. They also need a clear record and a chance to explain.",
    proposal: "Have a lawyer check the list. Until then show it as policy, and record each case with the staff member's reply, but don't deduct automatically."
  },
  {
    title: "New sections to check (added 23 Nov 2026)",
    why: "The policy had nothing on safeguarding, bullying, personal data, refunds, phones or using the portal. Draft sections are now in both policies, with these choices still to confirm.",
    proposal: "Check: the Head Teacher as safeguarding lead; reports looked into within 2 school days; phones handed in at the front desk; teachers reply to messages within 2 school days; records other than admission, report cards and results deleted 6 years after a pupil leaves; refunds within 30 days, none once a term has started, caution fee returned less damage. Add a deadline for parents' appeals to the Proprietress if wanted."
  },
  {
    title: "Pre-school examinations",
    why: "The Procedures Act leaves the number of questions for Reception and Nursery blank.",
    proposal: "Set the format for Reception and Nursery, or say they are assessed by practical tasks like the crèche."
  },
  {
    title: "Year coordinators and studies coordinators",
    why: "The Procedures Act lists their duties in its contents but the pages are empty.",
    proposal: "Write their duties, so the Who does what part is complete."
  },
  {
    title: "What “one session in advance” means",
    why: "The payment plan lists 10% off for paying one session in advance and 15% for two, but not by when the money must arrive. The app asks the bursar to say which payment it was each time.",
    proposal: "Say it plainly, for example: “all three terms of next session paid in full before this session's third term starts”."
  },
  {
    title: "Points from pupils' results and conduct",
    why: "The parents' policy says points can come from “academic ability” and “good conduct”, but not how many.",
    proposal: "Set the points (for example 100 for a gold welfare grade in a term), or remove the line."
  }
];
