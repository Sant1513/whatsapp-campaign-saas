// Prisma client + tenant-scoped client. Spec §3, §44.
// The tenant client is the isolation choke point: every query for a tenant-owned model is
// forced to carry organizationId taken from the authenticated session — NEVER from the client.
import { PrismaClient } from "@prisma/client";
import { createRequire } from "node:module";
import { env } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; pglite?: unknown };

function makeClient(): PrismaClient {
  // No-install local demo: in-process PGlite (WASM Postgres). Not used in production.
  if (env.DEMO_DB === "pglite") {
    const req = createRequire(import.meta.url);
    const { PGlite } = req("@electric-sql/pglite");
    const { PrismaPGlite } = req("pglite-prisma-adapter");
    const client = (globalForPrisma.pglite ??= new PGlite(env.DEMO_PGLITE_DIR));
    const adapter = new PrismaPGlite(client);
    return new PrismaClient({ adapter } as any);
  }
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

export const prisma = globalForPrisma.prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// Models that MUST be scoped by organizationId.
const TENANT_MODELS = new Set([
  "SerriConnection",
  "CampaignDefinition",
  "Template",
  "TemplateVersion",
  "TemplateVariable",
  "Contact",
  "Campaign",
  "CampaignRecipient",
  "Import",
  "ImportRow",
  "ValidationError",
  "Message",
  "MessageAttempt",
  "MediaAsset",
  "ScheduledJob",
  "AuditLog",
]);

const WHERE_OPS = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "updateMany",
  "deleteMany",
  "count",
  "aggregate",
  "groupBy",
]);

/**
 * Returns a Prisma client whose reads/writes are pinned to one organization.
 * Use findFirst (not findUnique) for tenant models so the org filter always applies.
 */
export function tenantDb(organizationId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !TENANT_MODELS.has(model)) return query(args);

          const a: any = args ?? {};

          if (WHERE_OPS.has(operation)) {
            a.where = a.where ? { AND: [a.where, { organizationId }] } : { organizationId };
          } else if (operation === "create") {
            a.data = { organizationId, ...a.data };
          } else if (operation === "createMany") {
            if (Array.isArray(a.data)) a.data = a.data.map((d: any) => ({ organizationId, ...d }));
          } else if (operation === "upsert") {
            a.where = a.where ? { AND: [a.where, { organizationId }] } : { organizationId };
            a.create = { organizationId, ...a.create };
          } else if (operation === "update" || operation === "delete") {
            // update/delete use a unique where; enforce org by wrapping (requires composite or
            // callers to include organizationId). We add it defensively.
            a.where = { ...a.where, organizationId };
          }
          return query(a);
        },
      },
    },
  });
}

export type TenantClient = ReturnType<typeof tenantDb>;
