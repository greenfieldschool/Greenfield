import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "crypto";

// Locks and unlocks the school's copy of a temporary password (table temporary_passwords, 20261119c migration).
// AES-256-GCM with a key derived from a server-only secret: TEMP_PASSWORD_KEY when set, otherwise the Supabase service
// key. The database only ever holds the scrambled text, so a copy of the database alone reveals nothing.
// If the key changes, old copies can't be read: the page then says "give a new one" (they still sign in fine).

function key(): Buffer | null {
  const secret = process.env.TEMP_PASSWORD_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return Buffer.from(hkdfSync("sha256", secret, "greenfield-temporary-passwords", "v1", 32));
}

export function lockTemporaryPassword(password: string): string | null {
  const k = key();
  if (!k) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return `v1:${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64")}`;
}

export function unlockTemporaryPassword(locked: string | null | undefined): string | null {
  const k = key();
  if (!k || !locked?.startsWith("v1:")) return null;
  try {
    const raw = Buffer.from(locked.slice(3), "base64");
    const decipher = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
