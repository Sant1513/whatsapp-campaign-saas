// Campaign state machine. Spec §31, §32. Invalid transitions throw.
export type CampaignStatus =
  | "DRAFT"
  | "VALIDATING"
  | "READY"
  | "SCHEDULED"
  | "PREPARING"
  | "SENDING"
  | "PAUSED"
  | "COMPLETED"
  | "PARTIALLY_COMPLETED"
  | "FAILED"
  | "CANCELLED";

const TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
  DRAFT: ["VALIDATING", "CANCELLED"],
  VALIDATING: ["READY", "DRAFT", "FAILED", "CANCELLED"],
  READY: ["SCHEDULED", "PREPARING", "DRAFT", "CANCELLED"],
  SCHEDULED: ["PREPARING", "READY", "CANCELLED"],
  PREPARING: ["SENDING", "FAILED", "CANCELLED"],
  SENDING: ["PAUSED", "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"],
  PAUSED: ["SENDING", "CANCELLED"],
  COMPLETED: [],
  PARTIALLY_COMPLETED: [],
  FAILED: ["DRAFT"], // allow re-preparation from a clean draft
  CANCELLED: [],
};

export class InvalidTransitionError extends Error {
  status = 409;
  constructor(from: CampaignStatus, to: CampaignStatus) {
    super(`Invalid campaign transition ${from} → ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function canTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: CampaignStatus, to: CampaignStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}

export const TERMINAL: CampaignStatus[] = [
  "COMPLETED",
  "PARTIALLY_COMPLETED",
  "CANCELLED",
];

export function isTerminal(s: CampaignStatus): boolean {
  return TERMINAL.includes(s);
}
