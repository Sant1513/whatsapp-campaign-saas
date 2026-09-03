// Retry policy. Spec §29. Only transient failures retry, with exponential backoff.
import type { SendResult } from "./providers/types";

export interface RetryPolicy {
  maxAttempts: number;
  baseDelayMs: number;
  factor: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 2000,
  factor: 3,
  maxDelayMs: 60000,
};

/** UNKNOWN is treated as retryable-once at the transport level but never re-sends blindly:
 * the worker only retries UNKNOWN if the provider supports idempotency (it does via
 * Idempotency-Key), so a retry cannot double-send. */
export function shouldRetry(result: SendResult, attempt: number, policy: RetryPolicy): boolean {
  if (attempt >= policy.maxAttempts) return false;
  if (result.outcome === "SENT") return false;
  if (result.outcome === "FAILED") return result.errorClass === "TRANSIENT";
  if (result.outcome === "UNKNOWN") return result.errorClass === "TRANSIENT";
  return false;
}

export function backoffMs(attempt: number, policy: RetryPolicy): number {
  const raw = policy.baseDelayMs * Math.pow(policy.factor, attempt - 1);
  const jitter = raw * 0.2 * Math.random();
  return Math.min(policy.maxDelayMs, Math.round(raw + jitter));
}
