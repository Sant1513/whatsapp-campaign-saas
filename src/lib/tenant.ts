// Session + tenant + RBAC resolution. Spec §3, §4, §44.
// Active organization comes from a signed session + a validated cookie — never a client-supplied
// body field. Every server action / route handler starts here.
import { cookies } from "next/headers";
import { auth } from "./auth";
import { prisma, tenantDb } from "./db";
import { assertCan, type Capability, type Role, ForbiddenError } from "./rbac";

export const ACTIVE_ORG_COOKIE = "active_org";

export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "Not authenticated") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export interface SessionUser {
  userId: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const u = session?.user as any;
  if (!u?.id) throw new UnauthorizedError();
  return { userId: u.id, email: u.email, name: u.name, isSuperAdmin: !!u.isSuperAdmin };
}

export interface TenantContext {
  userId: string;
  organizationId: string;
  role: Role;
  isSuperAdmin: boolean;
  db: ReturnType<typeof tenantDb>;
}

/**
 * Resolve the active organization for this request and the caller's role in it.
 * The org id is validated against the user's memberships — a forged cookie cannot grant access.
 */
export async function requireTenant(): Promise<TenantContext> {
  const user = await requireUser();
  const jar = await cookies();
  const requested = jar.get(ACTIVE_ORG_COOKIE)?.value;

  const memberships = await prisma.organizationUser.findMany({
    where: { userId: user.userId },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) throw new ForbiddenError("User has no organization membership");

  const membership =
    memberships.find((m) => m.organizationId === requested) ?? memberships[0];

  return {
    userId: user.userId,
    organizationId: membership.organizationId,
    role: membership.role as Role,
    isSuperAdmin: user.isSuperAdmin,
    db: tenantDb(membership.organizationId),
  };
}

export async function requireCap(cap: Capability): Promise<TenantContext> {
  const ctx = await requireTenant();
  assertCan(ctx.role, cap);
  return ctx;
}

export async function requireSuperAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isSuperAdmin) throw new ForbiddenError("Super admin only");
  return user;
}

export async function listMemberships(userId: string) {
  return prisma.organizationUser.findMany({
    where: { userId },
    include: { organization: true },
    orderBy: { createdAt: "asc" },
  });
}
