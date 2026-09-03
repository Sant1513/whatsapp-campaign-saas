// Route-handler helpers: consistent JSON, error mapping. Spec §49.
import { NextResponse } from "next/server";

export function json(data: unknown, init?: number | ResponseInit) {
  const opts = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data as any, opts);
}

export function handleError(e: unknown) {
  const err = e as any;
  const status = typeof err?.status === "number" ? err.status : 500;
  const message = err?.message ?? "Internal error";
  if (status >= 500) console.error("[api] error", err);
  return NextResponse.json({ error: message, code: err?.code }, { status });
}

/** Wrap an async handler with uniform error handling. */
export function route<T extends any[]>(fn: (...args: T) => Promise<Response>) {
  return async (...args: T): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      return handleError(e);
    }
  };
}
