// Phone validation/normalization to E.164 digits (no leading +). Spec §18.
import { parsePhoneNumberFromString } from "libphonenumber-js";

export interface PhoneResult {
  valid: boolean;
  /** E.164 digits without '+', e.g. "917983907047" — the form Serri's `destination` wants. */
  normalized?: string;
  reason?: string;
}

/**
 * Accepts values like "+91 79839 07047", "917983907047", "07983907047" (with defaultCountry).
 * Returns digits-only E.164 (Serri destination format) when valid.
 */
export function validatePhone(raw: unknown, defaultCountry = "IN"): PhoneResult {
  if (raw === null || raw === undefined) return { valid: false, reason: "empty" };
  const s = String(raw).trim();
  if (!s) return { valid: false, reason: "empty" };

  // 1. Explicit international form.
  if (s.startsWith("+")) {
    const p = parsePhoneNumberFromString(s);
    if (p?.isValid()) return { valid: true, normalized: p.number.replace("+", "") };
    return { valid: false, reason: "invalid_format" };
  }

  // 2. Try as a national number in the default country (handles leading-0 national forms).
  const national = parsePhoneNumberFromString(s, defaultCountry as any);
  if (national?.isValid()) return { valid: true, normalized: national.number.replace("+", "") };

  // 3. Fall back to treating digits as E.164 without the '+' (e.g. "917983907047").
  const digits = s.replace(/[^\d]/g, "");
  if (digits) {
    const intl = parsePhoneNumberFromString(`+${digits}`);
    if (intl?.isValid()) return { valid: true, normalized: intl.number.replace("+", "") };
  }

  return { valid: false, reason: "invalid_format" };
}
