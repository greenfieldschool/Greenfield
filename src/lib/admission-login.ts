// Pupils sign in with their admission number. Behind the scenes Supabase needs an email, so the number becomes
// "<number without symbols>@<school login domain>". The database builds it the same way
// (admission_login_local in docs/migrations/20261117_admission_numbers_and_accounts.sql) and moves the sign-in when
// a number changes. Keep the two in step.

export const STUDENT_LOGIN_DOMAIN = (process.env.NEXT_PUBLIC_STUDENT_LOGIN_EMAIL_DOMAIN ?? "students.greenfield.local")
  .trim()
  .toLowerCase();

export function admissionNumberToEmail(admissionNumberRaw: string) {
  const normalizedUser = admissionNumberRaw.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${normalizedUser}@${STUDENT_LOGIN_DOMAIN}`;
}

/** True for the hidden sign-in emails made from admission numbers (never shown to people as an email). */
export function isAdmissionLoginEmail(email: string | null | undefined) {
  return Boolean(email && email.toLowerCase().endsWith(`@${STUDENT_LOGIN_DOMAIN}`));
}

/** The same comparison form as admission_key() in the database: "GRE/2026/007" → "gre20267". */
export function admissionKey(raw: string | null | undefined) {
  const spaced = String(raw ?? "")
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/(^| )0+([0-9])/g, "$1$2");
  return spaced.replace(/ /g, "");
}

/** Tidies a typed number the way the database will store it: trimmed, single spaces, capitals. */
export function tidyAdmissionNumber(raw: string | null | undefined) {
  return String(raw ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

// Short, common, unambiguous words that are easy to read aloud and type on a phone keyboard.
const WORDS = [
  "mango", "river", "tiger", "lemon", "cloud", "eagle", "piano", "zebra", "maple", "honey", "ocean", "rocket",
  "garden", "pepper", "violet", "falcon", "banana", "candle", "forest", "jungle", "parrot", "pebble", "rabbit",
  "silver", "summer", "sunset", "turtle", "window", "yellow", "orange", "planet", "pencil", "button", "dragon",
  "guitar", "kettle", "ladder", "marble", "meadow", "puzzle", "rainbow", "saddle", "spring", "starry", "tomato",
  "velvet", "walnut", "hippo", "camel", "koala", "panda", "robin", "melon", "grape", "peach", "cocoa", "drum",
  "kite", "lily", "moon", "nest", "palm", "rose", "star", "wave", "yam", "plum", "fern", "owl", "bee", "sun"
];

function randomInt(max: number) {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % max;
}

/**
 * A readable temporary password like "mango-river-47": two words and two digits (no 0/1, which look like O/l).
 * About 22 bits from the words and 6 from the digits; fine for a first sign-in the person is asked to change,
 * and Supabase limits repeated wrong guesses.
 */
export function generateTemporaryPassword() {
  const digits = "23456789";
  const a = WORDS[randomInt(WORDS.length)];
  let b = WORDS[randomInt(WORDS.length)];
  while (b === a) b = WORDS[randomInt(WORDS.length)];
  return `${a}-${b}-${digits[randomInt(digits.length)]}${digits[randomInt(digits.length)]}`;
}
