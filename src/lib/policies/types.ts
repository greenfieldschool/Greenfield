// The school's policies, kept in code as numbered parts and sections so that the whole policy can be read on its
// own page and any one section can be shown on the page where it applies (<PolicyExcerpt />).
// The original Word documents live in Policies/ (kept out of git). See .claude/skills/school-policies.

export type PolicyBlock =
  | { kind: "text"; text: string }
  | { kind: "list"; items: string[] }
  | { kind: "steps"; items: string[] }
  | { kind: "table"; head: string[]; rows: string[][]; note?: string };

/** Who in the family audience reads a section. Staff see every section. */
export type PolicyAudience = "everyone" | "parents";

export type PolicySection = {
  /** Unique within the document; used as the page anchor (#id) and by <PolicyExcerpt section="…" />. */
  id: string;
  title: string;
  audience?: PolicyAudience;
  blocks: PolicyBlock[];
};

export type PolicyPart = { id: string; title: string; sections: PolicySection[] };

export type PolicyKey = "families" | "staff";

export type PolicyDoc = {
  key: PolicyKey;
  title: string;
  /** Who it's for, in one line. */
  readers: string;
  version: string;
  /** Set both when the Proprietress approves this version. Until then the portal shows nothing. */
  approvedBy: string | null;
  approvedOn: string | null;
  /** yyyy-mm-dd: the date management should review the policy by. */
  reviewBy: string;
  parts: PolicyPart[];
};

export type PolicySuggestion = { title: string; why: string; proposal: string };
