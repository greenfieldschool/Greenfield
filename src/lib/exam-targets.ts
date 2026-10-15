// Question targets ("how many questions of each type this test needs") are stored inside the test's
// description as a `||TARGETS:{...}||` marker, so no schema change was needed.
const TARGETS_RE = /\|\|TARGETS:(.*?)\|\|/;

export function parseDescriptionAndTargets(desc: string | null) {
  const text = desc || "";
  const match = text.match(TARGETS_RE);
  if (match) {
    try {
      const targets = JSON.parse(match[1]);
      const cleanDesc = text.replace(TARGETS_RE, "").trim();
      return { description: cleanDesc, targets: targets as Record<string, number> };
    } catch {
      // ignore malformed marker
    }
  }
  return { description: text, targets: {} as Record<string, number> };
}

export function formatDescriptionWithTargets(cleanDesc: string, targets: Record<string, number>) {
  const jsonStr = JSON.stringify(targets);
  return `${cleanDesc.trim()} ||TARGETS:${jsonStr}||`;
}

export function totalTarget(targets: Record<string, number>) {
  return Object.values(targets).reduce((acc, n) => acc + (Number(n) || 0), 0);
}
