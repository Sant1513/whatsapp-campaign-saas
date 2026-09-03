import { describe, it, expect } from "vitest";
import { validateBatch, type ValidateOptions } from "./engine";
import type { VariableDef } from "../variables/engine";

const variables: VariableDef[] = [
  { name: "FirstName", required: true, fallbackValue: "user", fallbackAllowed: true },
];

const base: ValidateOptions = {
  variables,
  mapping: { FirstName: "FirstName", Phone: "Phone" },
  phoneVar: "Phone",
  nameVar: "FirstName",
  allowDuplicates: false,
  defaultCountry: "IN",
};

describe("validateBatch (spec §18-§20)", () => {
  it("classifies eligible, invalid phone, duplicate, blank, missing param", () => {
    const rows = [
      { rowNumber: 1, data: { Phone: "917983907047", FirstName: "Rahul" } }, // eligible
      { rowNumber: 2, data: { Phone: "917983907047", FirstName: "Priya" } }, // duplicate
      { rowNumber: 3, data: { Phone: "bad", FirstName: "X" } }, // invalid phone
      { rowNumber: 4, data: { Phone: "", FirstName: "" } }, // blank row
    ];
    const { summary } = validateBatch(rows, base);
    expect(summary.uploaded).toBe(4);
    expect(summary.eligible).toBe(1);
    expect(summary.reasons.DUPLICATE).toBe(1);
    expect(summary.reasons.INVALID_PHONE).toBe(1);
    expect(summary.reasons.BLANK_ROW).toBe(1);
  });

  it("required variable with fallback allowed stays eligible", () => {
    const rows = [{ rowNumber: 1, data: { Phone: "919876543210", FirstName: "" } }];
    const { results } = validateBatch(rows, base);
    expect(results[0].eligible).toBe(true);
    expect(results[0].resolvedVariables.FirstName.source).toBe("fallback");
  });

  it("required variable without fallback is excluded as MISSING_PARAMETER", () => {
    const strict: ValidateOptions = {
      ...base,
      variables: [{ name: "FirstName", required: true, fallbackValue: null, fallbackAllowed: false }],
    };
    const rows = [{ rowNumber: 1, data: { Phone: "919876543210", FirstName: "" } }];
    const { results, summary } = validateBatch(rows, strict);
    expect(results[0].eligible).toBe(false);
    expect(results[0].reason).toBe("MISSING_PARAMETER");
    expect(summary.reasons.MISSING_PARAMETER).toBe(1);
  });

  it("allowDuplicates keeps repeats eligible (spec §19)", () => {
    const rows = [
      { rowNumber: 1, data: { Phone: "917983907047", FirstName: "A" } },
      { rowNumber: 2, data: { Phone: "917983907047", FirstName: "B" } },
    ];
    const { summary } = validateBatch(rows, { ...base, allowDuplicates: true });
    expect(summary.eligible).toBe(2);
    expect(summary.reasons.DUPLICATE).toBe(0);
  });

  it("required media with invalid URL is excluded (spec §15)", () => {
    const withMedia: ValidateOptions = {
      ...base,
      variables: [
        { name: "FirstName", required: true, fallbackValue: "user", fallbackAllowed: true },
        { name: "ImageURL", required: true, fallbackValue: null, fallbackAllowed: false, usedIn: "media_url" },
      ],
      mapping: { FirstName: "FirstName", Phone: "Phone", ImageURL: "ImageURL" },
      media: { required: true, urlVar: "ImageURL" },
    };
    const rows = [
      { rowNumber: 1, data: { Phone: "917983907047", FirstName: "A", ImageURL: "https://ok.example/x.jpg" } },
      { rowNumber: 2, data: { Phone: "919876543210", FirstName: "B", ImageURL: "not a url" } },
    ];
    const { results, summary } = validateBatch(rows, withMedia);
    expect(results[0].eligible).toBe(true);
    expect(results[1].eligible).toBe(false);
    expect(results[1].reason).toBe("INVALID_URL");
    expect(summary.reasons.INVALID_URL).toBe(1);
  });
});
