export const dynamic = "force-dynamic";
import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireTenant, requireCap } from "@/lib/tenant";
import { encryptSecret, last4 } from "@/lib/crypto";
import { serriProvider } from "@/lib/providers/serri";
import { audit } from "@/lib/audit";

// Serri connections. API keys are NEVER returned. Spec §8, §44, §70-R4.
export const GET = route(async () => {
  const ctx = await requireTenant();
  const connections = await ctx.db.serriConnection.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, endpoint: true, apiKeyLast4: true, defaultUserName: true, defaultSource: true, status: true, createdAt: true },
  });
  return json({ connections });
});

const schema = z.object({
  name: z.string().min(1).max(120),
  endpoint: z.string().url(),
  apiKey: z.string().min(8),
  defaultUserName: z.string().min(1),
  defaultSource: z.string().min(1),
});

export const POST = route(async (req: Request) => {
  const ctx = await requireCap("integration:manage");
  const body = schema.parse(await req.json());

  const check = await serriProvider.validateConfiguration({ endpoint: body.endpoint, apiKey: body.apiKey });
  if (!check.ok) throw Object.assign(new Error(check.errors.join("; ")), { status: 422 });

  const conn = await ctx.db.serriConnection.create({
    data: {
      organizationId: ctx.organizationId,
      name: body.name,
      endpoint: body.endpoint,
      apiKeyCipher: encryptSecret(body.apiKey), // encrypted at rest
      apiKeyLast4: last4(body.apiKey),
      defaultUserName: body.defaultUserName,
      defaultSource: body.defaultSource,
      status: "ACTIVE",
    },
    select: { id: true, name: true, endpoint: true, apiKeyLast4: true, status: true },
  });
  await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "integration.create", entityType: "serri_connection", entityId: conn.id, metadata: { name: body.name } });
  return json({ connection: conn }, 201);
});
