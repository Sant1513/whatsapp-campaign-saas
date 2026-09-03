// Pluggable file storage. Spec §67. Local driver for dev; swap for S3 in prod.
// Files (CSV/XLSX/media/reports) live outside the DB; metadata lives in the DB.
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "./env";

export interface StoredFile {
  key: string;
  size: number;
}

const ALLOWED_UPLOAD_EXT = new Set([".csv", ".xlsx", ".xls"]);
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB

export function assertUploadAllowed(filename: string, size: number): void {
  const ext = path.extname(filename).toLowerCase();
  if (!ALLOWED_UPLOAD_EXT.has(ext)) {
    throw Object.assign(new Error(`Unsupported file type: ${ext}`), { status: 422 });
  }
  if (size > MAX_UPLOAD_BYTES) {
    throw Object.assign(new Error("File exceeds 50MB limit"), { status: 413 });
  }
}

function localPath(key: string): string {
  return path.join(env.STORAGE_LOCAL_DIR, key);
}

export async function putFile(orgId: string, filename: string, data: Buffer): Promise<StoredFile> {
  const key = `${orgId}/${crypto.randomUUID()}-${path.basename(filename)}`;
  if (env.STORAGE_DRIVER === "local") {
    const full = localPath(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
    return { key, size: data.byteLength };
  }
  throw new Error("S3 driver not configured in this build");
}

export async function getFile(key: string): Promise<Buffer> {
  if (env.STORAGE_DRIVER === "local") {
    return fs.readFile(localPath(key));
  }
  throw new Error("S3 driver not configured in this build");
}
