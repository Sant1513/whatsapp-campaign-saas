import { describe, it, expect } from "vitest";
import { validatePhone } from "./phone";

describe("validatePhone", () => {
  it("accepts E.164 digits without +", () => {
    expect(validatePhone("917983907047")).toMatchObject({ valid: true, normalized: "917983907047" });
  });
  it("accepts +country formatted", () => {
    expect(validatePhone("+91 79839 07047")).toMatchObject({ valid: true, normalized: "917983907047" });
  });
  it("normalizes a national number with default country", () => {
    const r = validatePhone("07983907047", "GB");
    expect(r.valid).toBe(true);
    expect(r.normalized?.startsWith("44")).toBe(true);
  });
  it("rejects empty", () => {
    expect(validatePhone("")).toMatchObject({ valid: false, reason: "empty" });
  });
  it("rejects garbage", () => {
    expect(validatePhone("not-a-phone")).toMatchObject({ valid: false });
  });
  it("rejects too-short numbers", () => {
    expect(validatePhone("123").valid).toBe(false);
  });
});
