// Variable engine. Spec §11, §12, §13.
// ONE resolver shared by CSV send, individual send, preview and test (spec §26, §53).

export interface VariableDef {
  name: string;            // "FirstName" (no $)
  required: boolean;
  fallbackValue?: string | null;
  fallbackAllowed: boolean; // org-admin controlled (§13)
  usedIn?: string;
}

/** Mapping: variable name -> CSV column header. */
export type FieldMapping = Record<string, string>;

export interface ResolvedVariable {
  name: string;
  value: string | null;
  source: "csv" | "fallback" | "missing";
  ok: boolean;            // usable for send?
}

export interface ResolutionResult {
  variables: Record<string, ResolvedVariable>;
  /** required variables that are missing and cannot be filled by an allowed fallback */
  missingRequired: string[];
  ok: boolean;
}

/** Extract $Tokens from a body of text (deduplicated, order preserved). Spec §11. */
export function extractTokens(text: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /\$([A-Za-z_][A-Za-z0-9_]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[\s_\-]+/g, "");
}

/**
 * Auto-match template variables to CSV columns (spec §12).
 * Exact-normalized match first, then a small synonym table. Manual override always wins later.
 */
export function autoMatch(variables: string[], headers: string[]): FieldMapping {
  const synonyms: Record<string, string[]> = {
    firstname: ["first name", "fname", "name", "givenname"],
    phone: ["mobile", "mobile number", "phone number", "contact", "whatsapp", "number", "msisdn"],
    startdate: ["joining date", "start", "joindate", "date"],
    course: ["course name", "program", "programme"],
    imageurl: ["image", "image url", "photo", "picture", "img"],
    pdfurl: ["pdf", "pdf url", "document", "doc"],
  };
  const headerByNorm = new Map<string, string>();
  for (const h of headers) headerByNorm.set(normalizeHeader(h), h);

  const mapping: FieldMapping = {};
  for (const v of variables) {
    const nv = normalizeHeader(v);
    if (headerByNorm.has(nv)) {
      mapping[v] = headerByNorm.get(nv)!;
      continue;
    }
    const syns = synonyms[nv] ?? [];
    for (const s of syns) {
      const ns = normalizeHeader(s);
      if (headerByNorm.has(ns)) {
        mapping[v] = headerByNorm.get(ns)!;
        break;
      }
    }
  }
  return mapping;
}

/** Resolve all variables for one recipient row. Pure. Spec §11, §13. */
export function resolveVariables(
  defs: VariableDef[],
  mapping: FieldMapping,
  row: Record<string, unknown>,
): ResolutionResult {
  const variables: Record<string, ResolvedVariable> = {};
  const missingRequired: string[] = [];

  for (const def of defs) {
    const col = mapping[def.name];
    const rawVal = col != null ? row[col] : undefined;
    const csvVal =
      rawVal === null || rawVal === undefined ? "" : String(rawVal).trim();

    if (csvVal !== "") {
      variables[def.name] = { name: def.name, value: csvVal, source: "csv", ok: true };
      continue;
    }

    // No CSV value — try fallback if permitted (§13).
    const fallbackUsable =
      def.fallbackAllowed &&
      def.fallbackValue !== null &&
      def.fallbackValue !== undefined &&
      def.fallbackValue !== "";

    if (fallbackUsable) {
      variables[def.name] = {
        name: def.name,
        value: def.fallbackValue as string,
        source: "fallback",
        ok: true,
      };
      continue;
    }

    // Missing and no usable fallback.
    variables[def.name] = { name: def.name, value: null, source: "missing", ok: !def.required };
    if (def.required) missingRequired.push(def.name);
  }

  return { variables, missingRequired, ok: missingRequired.length === 0 };
}

/** Substitute $Tokens in a string using resolved variables. Unknown tokens left as-is. */
export function interpolate(
  text: string,
  variables: Record<string, ResolvedVariable>,
): string {
  return text.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (full, name: string) => {
    const v = variables[name];
    return v && v.value !== null ? v.value : full;
  });
}
