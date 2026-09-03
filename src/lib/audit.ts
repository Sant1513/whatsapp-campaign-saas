// Audit logging. Spec §42. Never store secrets.
import { prisma } from "./db";

export interface AuditInput {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

const SECRET_KEYS = /key|token|secret|password|auth|cipher/i;

function scrub(meta: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    out[k] = SECRET_KEYS.test(k) ? "__REDACTED__" : v;
  }
  return out;
}

export async function audit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        userId: input.userId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: scrub(input.metadata) as any,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });
  } catch {
    // Auditing must never break the primary action; log to stderr as a fallback.
    console.error("audit_write_failed", input.action);
  }
}
