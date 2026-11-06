import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "crypto";

// Server only. The Gmail access key is stored encrypted (AES-256-GCM) with EMAIL_TOKEN_KEY, and links in emails
// (unsubscribe) are signed with it, so they can't be changed to act for someone else.

function key(): Buffer | null {
  const raw = process.env.EMAIL_TOKEN_KEY ?? "";
  try {
    const k = Buffer.from(raw, "base64");
    return k.length === 32 ? k : null;
  } catch {
    return null;
  }
}

export const hasTokenKey = () => key() !== null;

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) throw new Error("EMAIL_TOKEN_KEY is not set");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptSecret(sealed: string): string | null {
  const k = key();
  const [v, iv, tag, data] = sealed.split(":");
  if (!k || v !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function sign(value: string): string {
  const k = key();
  if (!k) throw new Error("EMAIL_TOKEN_KEY is not set");
  return createHmac("sha256", k).update(value).digest("base64url");
}

export function verifySignature(value: string, signature: string): boolean {
  if (!key()) return false;
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
