import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, last4, maskKey } from "./crypto";

describe("field encryption (spec §8, §44)", () => {
  it("round-trips a secret", () => {
    const secret = "sk_live_abcdef1234567890";
    const cipher = encryptSecret(secret);
    expect(cipher).not.toContain(secret);
    expect(decryptSecret(cipher)).toBe(secret);
  });
  it("produces different ciphertext each time (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });
  it("tampered ciphertext fails auth (GCM)", () => {
    const c = encryptSecret("secret");
    const tampered = c.slice(0, -4) + (c.slice(-4) === "AAAA" ? "BBBB" : "AAAA");
    expect(() => decryptSecret(tampered)).toThrow();
  });
  it("masks display value", () => {
    expect(maskKey(last4("sk_live_abcdef1234567890"))).toBe("••••••••••••7890");
  });
});
