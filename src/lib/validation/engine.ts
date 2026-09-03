// Recipient validation engine. Spec §7, §17-§21, §23. Pure & deterministic (network media
// reachability is checked separately/async so this stays unit-testable). Shared by CSV import,
// individual send, preview and preflight (spec §26, §53).
import { validatePhone } from "./phone";
import { validateUrlSyntax } from "./url";
import {
  resolveVariables,
  type FieldMapping,
  type VariableDef,
  type ResolvedVariable,
} from "../variables/engine";

export type ExclusionReason =
  | "INVALID_PHONE"
  | "DUPLICATE"
  | "MISSING_PARAMETER"
  | "INVALID_URL"
  | "MISSING_MEDIA"
  | "BLANK_ROW"
  | "INVALID_PAYLOAD";

export interface MediaRequirement {
  required: boolean;
  urlVar?: string; // variable that carries the media URL
}

export interface RecipientInput {
  rowNumber: number;
  data: Record<string, unknown>;
}

export interface RecipientResult {
  rowNumber: number;
  eligible: boolean;
  destination?: string;
  name?: string;
  resolvedVariables: Record<string, ResolvedVariable>;
  reason?: ExclusionReason;
  field?: string;
  value?: string;
}

export interface ValidateOptions {
  variables: VariableDef[];
  mapping: FieldMapping;
  phoneVar: string;        // which variable/column maps to phone
  nameVar?: string;
  media?: MediaRequirement;
  allowDuplicates: boolean;
  defaultCountry?: string;
}

export interface ValidationSummary {
  uploaded: number;
  eligible: number;
  excluded: number;
  reasons: Record<ExclusionReason, number>;
}

function emptyReasons(): Record<ExclusionReason, number> {
  return {
    INVALID_PHONE: 0,
    DUPLICATE: 0,
    MISSING_PARAMETER: 0,
    INVALID_URL: 0,
    MISSING_MEDIA: 0,
    BLANK_ROW: 0,
    INVALID_PAYLOAD: 0,
  };
}

function isBlankRow(data: Record<string, unknown>): boolean {
  return Object.values(data).every(
    (v) => v === null || v === undefined || String(v).trim() === "",
  );
}

/** Validate a single recipient (no network). Spec §23 hard gate order. */
export function validateRecipient(
  input: RecipientInput,
  opts: ValidateOptions,
  seenDestinations: Set<string>,
): RecipientResult {
  const base = {
    rowNumber: input.rowNumber,
    resolvedVariables: {} as Record<string, ResolvedVariable>,
  };

  // 1. Blank row
  if (isBlankRow(input.data)) {
    return { ...base, eligible: false, reason: "BLANK_ROW" };
  }

  // 2. Phone
  const phoneCol = opts.mapping[opts.phoneVar] ?? opts.phoneVar;
  const phone = validatePhone(input.data[phoneCol], opts.defaultCountry ?? "IN");
  if (!phone.valid) {
    return {
      ...base,
      eligible: false,
      reason: "INVALID_PHONE",
      field: phoneCol,
      value: String(input.data[phoneCol] ?? ""),
    };
  }
  const destination = phone.normalized!;
  const name = opts.nameVar
    ? String(input.data[opts.mapping[opts.nameVar] ?? opts.nameVar] ?? "")
    : "";

  // 3. Required variables (missing parameter)
  const res = resolveVariables(opts.variables, opts.mapping, input.data);
  if (!res.ok) {
    return {
      ...base,
      eligible: false,
      destination,
      name,
      resolvedVariables: res.variables,
      reason: "MISSING_PARAMETER",
      field: res.missingRequired[0],
      value: "(blank)",
    };
  }

  // 4. Media URL syntax (network reachability checked later, pre-send)
  if (opts.media?.required) {
    const urlVar = opts.media.urlVar;
    const urlVal = urlVar ? res.variables[urlVar]?.value : undefined;
    if (!urlVal) {
      return { ...base, eligible: false, destination, name, resolvedVariables: res.variables, reason: "MISSING_MEDIA", field: urlVar };
    }
    const syn = validateUrlSyntax(urlVal);
    if (!syn.valid) {
      return { ...base, eligible: false, destination, name, resolvedVariables: res.variables, reason: "INVALID_URL", field: urlVar, value: urlVal };
    }
  }

  // 5. Duplicate (scope: this campaign / definition). Spec §19.
  if (!opts.allowDuplicates) {
    if (seenDestinations.has(destination)) {
      return { ...base, eligible: false, destination, name, resolvedVariables: res.variables, reason: "DUPLICATE", field: phoneCol, value: destination };
    }
  }
  seenDestinations.add(destination);

  return { ...base, eligible: true, destination, name, resolvedVariables: res.variables };
}

/** Validate a whole batch, first-occurrence wins for duplicates. */
export function validateBatch(
  rows: RecipientInput[],
  opts: ValidateOptions,
): { results: RecipientResult[]; summary: ValidationSummary } {
  const seen = new Set<string>();
  const results: RecipientResult[] = [];
  const summary: ValidationSummary = {
    uploaded: rows.length,
    eligible: 0,
    excluded: 0,
    reasons: emptyReasons(),
  };
  for (const r of rows) {
    const res = validateRecipient(r, opts, seen);
    results.push(res);
    if (res.eligible) summary.eligible++;
    else {
      summary.excluded++;
      if (res.reason) summary.reasons[res.reason]++;
    }
  }
  return { results, summary };
}
