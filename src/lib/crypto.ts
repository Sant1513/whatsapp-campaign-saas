// AES-256-GCM field encryption for secrets at rest (Serri API keys). Spec §8, §44, §70-R4.
// The ciphertext format is: base64( iv(12) || authTag(16) || ciphertext ).
// The plaintext key is only ever decrypted inside backend services/workers, never sent to
// the client, never logged.
import crypto from "node:crypto";
import { env } from "./env";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  if (!env.ENCRYPTION_KEY) {
    throw new Error(
      "ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.",
    );
  }
  const key = Buffer.from(env.ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_KEY must decode to exactly 32 bytes (base64).");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Last 4 chars for masked display (e.g. "••••••••1234"). Never store more. */
export function last4(secret: string): string {
  return secret.slice(-4);
}

export function maskKey(l4: string): string {
  return "••••••••••••" + l4;
}
