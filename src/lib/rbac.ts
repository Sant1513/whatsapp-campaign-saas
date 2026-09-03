// Role-based capabilities. Spec §4. Authorization is always checked server-side.
export type Role = "ORG_ADMIN" | "CAMPAIGN_MANAGER" | "VIEWER";

export type Capability =
  | "org:manageUsers"
  | "integration:manage"
  | "template:write"
  | "campaign:create"
  | "campaign:audience"
  | "campaign:test"
  | "campaign:launch"
  | "campaign:control" // pause/cancel
  | "report:export"
  | "view";

const MATRIX: Record<Role, Capability[]> = {
  ORG_ADMIN: [
    "org:manageUsers",
    "integration:manage",
    "template:write",
    "campaign:create",
    "campaign:audience",
    "campaign:test",
    "campaign:launch",
    "campaign:control",
    "report:export",
    "view",
  ],
  CAMPAIGN_MANAGER: [
    "campaign:create",
    "campaign:audience",
    "campaign:test",
    "campaign:launch",
    "campaign:control",
    "report:export",
    "view",
  ],
  VIEWER: ["view"],
};

export function can(role: Role, cap: Capability): boolean {
  return MATRIX[role]?.includes(cap) ?? false;
}

export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function assertCan(role: Role, cap: Capability): void {
  if (!can(role, cap)) throw new ForbiddenError(`Role ${role} lacks capability ${cap}`);
}
