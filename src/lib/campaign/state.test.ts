import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, InvalidTransitionError, isTerminal } from "./state";

describe("campaign state machine (spec §31)", () => {
  it("allows valid transitions", () => {
    expect(canTransition("DRAFT", "VALIDATING")).toBe(true);
    expect(canTransition("READY", "PREPARING")).toBe(true);
    expect(canTransition("SENDING", "PAUSED")).toBe(true);
    expect(canTransition("PAUSED", "SENDING")).toBe(true);
    expect(canTransition("SENDING", "COMPLETED")).toBe(true);
  });
  it("rejects invalid transitions", () => {
    expect(canTransition("DRAFT", "SENDING")).toBe(false);
    expect(canTransition("COMPLETED", "SENDING")).toBe(false);
    expect(canTransition("CANCELLED", "READY")).toBe(false);
  });
  it("assertTransition throws on invalid", () => {
    expect(() => assertTransition("DRAFT", "COMPLETED")).toThrow(InvalidTransitionError);
  });
  it("terminal states", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("SENDING")).toBe(false);
  });
});
