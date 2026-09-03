import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireTenant, requireCap } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { encryptSecret, last4 } from "@/lib/crypto";
import { audit } from "@/lib/audit";

export const GET = route(async () => {
  const ctx = await requireTenant();
  const defs = await ctx.db.campaignDefinition.findMany({
    where: { status: "ACTIVE" },
    orderBy: { name: "asc" },
  });
  return json({ definitions: defs });
});

const schema = z.object({
  campaignName: z.string().min(1),
  endpoint: z.string().url().default("https://backend.api-wa.co/campaign/serri-india/api/v2"),
  apiKey: z.string().min(1),
  userName: z.string().default(""),
  source: z.string().default(""),
  messageType: z.enum([
    "TEXT", "IMAGE", "IMAGE_CAPTION", "AUDIO", "VIDEO", "DOCUMENT",
    "TEXT_IMAGE", "TEXT_AUDIO", "TEXT_VIDEO", "TEXT_DOCUMENT", "MULTI_MEDIA",
  ]).default("TEXT"),
  templateParamOrder: z.array(z.string()).default([]),
  mediaSpec: z.record(z.string(), z.any()).default({}),
});

/**
 * Create-or-return a CampaignDefinition from a parsed Serri cURL.
 * Also creates/updates a SerriConnection for the API key (by last-4 dedup).
 */
export const POST = route(async (req: Request) => {
  const ctx = await requireCap("integration:manage");
  const body = schema.parse(await req.json());

  const keyLast4 = last4(body.apiKey);

  // Find or create a SerriConnection for this API key + endpoint.
  let conn = await ctx.db.serriConnection.findFirst({
    where: { apiKeyLast4: keyLast4 },
  });
  if (!conn) {
    conn = await ctx.db.serriConnection.create({
      data: {
        organizationId: ctx.organizationId,
        name: `Serri (…${keyLast4})`,
        endpoint: body.endpoint,
        apiKeyCipher: encryptSecret(body.apiKey),
        apiKeyLast4: keyLast4,
        defaultUserName: body.userName,
        defaultSource: body.source,
        status: "ACTIVE",
      },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: "serriConnection.create", entityType: "serriConnection", entityId: conn.id,
      metadata: { name: conn.name, fromCurl: true },
    });
  }

  // Find or create a CampaignDefinition for this campaign name.
  let def = await ctx.db.campaignDefinition.findFirst({
    where: { serriCampaignName: body.campaignName },
  });
  if (!def) {
    def = await ctx.db.campaignDefinition.create({
      data: {
        organizationId: ctx.organizationId,
        name: body.campaignName.replace(/_/g, " "),
        serriCampaignName: body.campaignName,
        messageType: body.messageType,
        status: "ACTIVE",
        spec: {
          templateParamOrder: body.templateParamOrder,
          ...(Object.keys(body.mediaSpec).length > 0 ? { media: body.mediaSpec } : {}),
        },
      },
    });
    await audit({
      organizationId: ctx.organizationId, userId: ctx.userId,
      action: "campaignDefinition.create", entityType: "campaignDefinition", entityId: def.id,
      metadata: { name: def.name, fromCurl: true },
    });
  }

  return json({ connection: conn, definition: def }, 201);
});
