import { gradeRemark, round2 } from "@/lib/results";
import { ordinal, type ClassReport, type StudentReport } from "@/lib/term-report";

// Certificates of achievement, worked out from the class report so they always match the report cards.
//
//  - Class position: 1st, 2nd and 3rd on the final score (ties share the place: "Joint 1st").
//  - Best in a subject: the highest score in the class for that subject (ties are "joint").
//  - Welfare award: Gold / Silver / Bronze from the level's welfare award thresholds.
// Positions and subject awards need at least two pupils with a score, so a class of one never "comes first".

export type AwardKind = "position" | "subject" | "welfare";
export type AwardTier = "gold" | "silver" | "bronze";

export type Award = {
  key: string;
  kind: AwardKind;
  tier: AwardTier;
  /** Big line on the certificate, e.g. "Certificate of Excellence". */
  heading: string;
  /** Short name used in lists and on the seal, e.g. "1st in class", "Best in Mathematics", "Gold welfare award". */
  title: string;
  /** Why, in a sentence that follows "for …". */
  reason: string;
};

export const AWARD_KINDS: Array<{ key: AwardKind; label: string }> = [
  { key: "position", label: "Class positions" },
  { key: "subject", label: "Best in subject" },
  { key: "welfare", label: "Welfare awards" }
];

const score = (v: number) => String(round2(v));
const tierFor = (place: number): AwardTier => (place === 1 ? "gold" : place === 2 ? "silver" : "bronze");

export function awardsFor(report: ClassReport, r: StudentReport): Award[] {
  const awards: Award[] = [];
  const cls = report.cls.name;

  const ranked = report.students.filter((s) => s.termTotal !== null).length;
  if (r.position && r.position <= 3 && r.termTotal !== null && ranked >= 2) {
    const joint = report.students.filter((s) => s.position === r.position).length > 1;
    const place = `${joint ? "joint " : ""}${ordinal(r.position)}`;
    const remark = gradeRemark(r.termGrade, report.grades);
    awards.push({
      key: "position",
      kind: "position",
      tier: tierFor(r.position),
      heading: "Certificate of Excellence",
      title: `${place.charAt(0).toUpperCase()}${place.slice(1)} in class`,
      reason: `coming ${place} in ${cls} with a final score of ${score(r.termTotal)} out of 100${
        r.termGrade ? ` (grade ${r.termGrade}${remark ? `, ${remark}` : ""})` : ""
      }`
    });
  }

  report.subjects.forEach((sub, i) => {
    const mine = r.subjects[i];
    if (mine?.position !== 1 || mine.percent === null) return;
    const scored = report.students.filter((s) => s.subjects[i]?.percent !== null).length;
    if (scored < 2) return;
    const joint = report.students.filter((s) => s.subjects[i]?.position === 1).length > 1;
    awards.push({
      key: `subject:${sub.id}`,
      kind: "subject",
      tier: "gold",
      heading: "Certificate of Merit",
      title: `Best in ${sub.name}`,
      reason: `the ${joint ? "joint " : ""}highest score in ${sub.name} in ${cls}: ${score(mine.percent)} out of 100`
    });
  });

  const badge = r.welfareBadge?.toLowerCase();
  if ((badge === "gold" || badge === "silver" || badge === "bronze") && r.welfare.percent !== null) {
    const weeks = r.welfare.mode === "weekly" && r.welfare.weeksCounted > 1 ? `, the average of ${r.welfare.weeksCounted} weeks` : "";
    awards.push({
      key: "welfare",
      kind: "welfare",
      tier: badge,
      heading: "Award for Character & Welfare",
      title: `${r.welfareBadge} welfare award`,
      reason: `a welfare score of ${score(r.welfare.percent)} out of 100${weeks}, for attendance, punctuality, conduct, politeness, honesty and taking part`
    });
  }

  return awards;
}
