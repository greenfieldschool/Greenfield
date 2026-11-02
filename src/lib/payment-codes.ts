// Payment IDs: short codes for the things parents pay for ("SF" = School fees). Parents write the child's
// admission number and one of these in the transfer description, e.g. "GRE/2026/447 SF".

// Words that would be confused with other parts of a description.
export const RESERVED_CODES = ["INV", "NGN", "GRE", "POS", "TRF", "NIP"];

export function normalizeCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Null when the code is fine, otherwise a plain-words reason. `taken` = codes used by other categories. */
export function codeProblem(code: string, taken: Set<string>): string | null {
  if (!/^[A-Z0-9]{2,8}$/.test(code)) return "A payment ID is 2 to 8 letters or numbers, with no spaces.";
  if (RESERVED_CODES.includes(code)) return `"${code}" is kept for other things in bank descriptions. Choose another.`;
  if (taken.has(code)) return `"${code}" is already used by another fee type.`;
  return null;
}

/** School fees -> SF, Uniform -> UNI, Sports and Games -> SAG; a number is added if the code is taken. */
export function suggestPaymentCode(name: string, taken: Set<string>): string {
  const ws = name.replace(/[^A-Za-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
  let base = ws.length > 1 ? ws.map((w) => w[0]).join("") : (ws[0] ?? "").slice(0, 3);
  base = normalizeCode(base).slice(0, 6);
  if (base.length < 2) base = "FEE";
  let candidate = base;
  for (let n = 2; RESERVED_CODES.includes(candidate) || taken.has(candidate); n += 1) candidate = `${base}${n}`;
  return candidate;
}

/** What a parent should write in the transfer description. */
export function transferDescription(admissionNumber: string | null | undefined, paymentId: string) {
  return `${admissionNumber?.trim() || "ADMISSION-NO"} ${paymentId}`;
}
