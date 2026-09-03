// CSV/XLSX parsing. Spec §17, §63. Detects headers, normalizes fields, flags structure errors.
// Large files should be streamed in a worker; this module exposes both a buffer parser (small)
// and a header sniffer.
import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
}

export class FileStructureError extends Error {
  status = 422;
  constructor(message: string) {
    super(message);
    this.name = "FileStructureError";
  }
}

function normalizeHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  return headers.map((h) => {
    let name = (h ?? "").toString().trim();
    if (!name) name = "column";
    // de-duplicate collided headers deterministically
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    return count === 0 ? name : `${name}_${count}`;
  });
}

export function parseCsv(content: string): ParsedTable {
  const result = Papa.parse<Record<string, string>>(content, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  if (result.errors.length) {
    const fatal = result.errors.find((e) => e.type === "Delimiter" || e.code === "UndetectableDelimiter");
    if (fatal) throw new FileStructureError(`Unable to parse CSV: ${fatal.message}`);
  }
  const headers = normalizeHeaders(result.meta.fields ?? []);
  if (!headers.length) throw new FileStructureError("No headers detected in file");
  const rows = (result.data ?? []).map((r) => coerceRow(r));
  return { headers, rows, totalRows: rows.length };
}

export function parseXlsx(buffer: ArrayBuffer): ParsedTable {
  const wb = XLSX.read(buffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new FileStructureError("Workbook has no sheets");
  const sheet = wb.Sheets[sheetName];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  if (!json.length) return { headers: [], rows: [], totalRows: 0 };
  const headers = normalizeHeaders(Object.keys(json[0] as object));
  const rows = json.map((r) => coerceRow(r as Record<string, unknown>));
  return { headers, rows, totalRows: rows.length };
}

function coerceRow(r: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r)) {
    out[k.trim()] = v === null || v === undefined ? "" : String(v).trim();
  }
  return out;
}

export function parseFile(filename: string, content: ArrayBuffer): ParsedTable {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return parseXlsx(content);
  }
  const text = new TextDecoder("utf-8").decode(content);
  return parseCsv(text);
}
