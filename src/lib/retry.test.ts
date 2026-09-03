import { describe, it, expect } from "vitest";
import { shouldRetry, backoffMs, DEFAULT_RETRY } from "./retry";
import type { SendResult } from "./providers/types";

const r = (o: SendResult): SendResult => o;

describe("retry policy (spec §29)", () => {
  it("does not retry SENT", () => {
    expect(shouldRetry(r({ outcome: "SENT" }), 1, DEFAULT_RETRY)).toBe(false);
  });
  it("retries transient FAILED under max attempts", () => {
    expect(shouldRetry(r({ outcome: "FAILED", errorClass: "TRANSIENT" }), 1, DEFAULT_RETRY)).toBe(true);
  });
  it("does not retry permanent FAILED", () => {
    expect(shouldRetry(r({ outcome: "FAILED", errorClass: "PERMANENT" }), 1, DEFAULT_RETRY)).toBe(false);
  });
  it("stops at max attempts", () => {
    expect(shouldRetry(r({ outcome: "FAILED", errorClass: "TRANSIENT" }), 3, DEFAULT_RETRY)).toBe(false);
  });
  it("backoff grows and is capped", () => {
    const a1 = backoffMs(1, DEFAULT_RETRY);
    const a2 = backoffMs(2, DEFAULT_RETRY);
    expect(a2).toBeGreaterThan(a1);
    expect(backoffMs(10, DEFAULT_RETRY)).toBeLessThanOrEqual(DEFAULT_RETRY.maxDelayMs);
  });
});
