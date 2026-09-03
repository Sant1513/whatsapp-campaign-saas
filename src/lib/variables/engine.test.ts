import { describe, it, expect } from "vitest";
import {
  extractTokens,
  autoMatch,
  resolveVariables,
  interpolate,
  type VariableDef,
} from "./engine";

describe("extractTokens", () => {
  it("extracts unique $tokens in order", () => {
    expect(extractTokens("Hi $FirstName, your $Course starts $StartDate. Bye $FirstName")).toEqual([
      "FirstName",
      "Course",
      "StartDate",
    ]);
  });
  it("returns empty for no tokens", () => {
    expect(extractTokens("plain text")).toEqual([]);
  });
});

describe("autoMatch", () => {
  it("matches by normalized name and synonyms", () => {
    const m = autoMatch(
      ["FirstName", "Course", "StartDate", "Phone"],
      ["First Name", "Course Name", "Joining Date", "Mobile Number"],
    );
    expect(m).toEqual({
      FirstName: "First Name",
      Course: "Course Name",
      StartDate: "Joining Date",
      Phone: "Mobile Number",
    });
  });
  it("leaves unmatched variables out", () => {
    const m = autoMatch(["Unknown"], ["A", "B"]);
    expect(m.Unknown).toBeUndefined();
  });
});

const defs: VariableDef[] = [
  { name: "FirstName", required: true, fallbackValue: "user", fallbackAllowed: true },
  { name: "Course", required: true, fallbackValue: null, fallbackAllowed: false },
];

describe("resolveVariables", () => {
  it("uses CSV value when present", () => {
    const r = resolveVariables(defs, { FirstName: "fn", Course: "c" }, { fn: "Rahul", c: "AI" });
    expect(r.ok).toBe(true);
    expect(r.variables.FirstName).toMatchObject({ value: "Rahul", source: "csv" });
  });
  it("falls back when allowed and CSV empty (spec §13)", () => {
    const r = resolveVariables(defs, { FirstName: "fn", Course: "c" }, { fn: "", c: "AI" });
    expect(r.ok).toBe(true);
    expect(r.variables.FirstName).toMatchObject({ value: "user", source: "fallback" });
  });
  it("excludes when required + fallback not permitted + missing (spec §13, §70-R1)", () => {
    const r = resolveVariables(defs, { FirstName: "fn", Course: "c" }, { fn: "Rahul", c: "" });
    expect(r.ok).toBe(false);
    expect(r.missingRequired).toContain("Course");
    expect(r.variables.Course).toMatchObject({ source: "missing", ok: false });
  });
});

describe("interpolate", () => {
  it("substitutes resolved values and leaves unknown tokens", () => {
    const r = resolveVariables(defs, { FirstName: "fn", Course: "c" }, { fn: "Rahul", c: "AI" });
    expect(interpolate("Hi $FirstName, $Course, $Unknown", r.variables)).toBe(
      "Hi Rahul, AI, $Unknown",
    );
  });
});
