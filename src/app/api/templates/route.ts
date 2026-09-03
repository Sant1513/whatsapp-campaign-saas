import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireTenant, requireCap } from "@/lib/tenant";
import { extractTokens } from "@/lib/variables/engine";
import { audit } from "@/lib/audit";

export const GET = route(async () => {
  const ctx = await requireTenant();
  const templates = await ctx.db.template.findMany({
    where: { status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    include: {
      currentVersion: { include: { campaignDefinition: true, variables: true } },
      versions: { select: { id: true, version: true }, orderBy: { version: "desc" } },
    },
  });
  return json({ templates });
});

const variableSchema = z.object({
  name: z.string().min(1),
  required: z.boolean().default(true),
  fallbackValue: z.string().nullable().optional(),
  fallbackAllowed: z.boolean().default(true),
  usedIn: z.string().default("text"),
});

const schema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  campaignDefinitionId: z.string(),
  messageType: z.enum([
    "TEXT", "IMAGE", "IMAGE_CAPTION", "AUDIO", "VIDEO", "DOCUMENT",
    "TEXT_IMAGE", "TEXT_AUDIO", "TEXT_VIDEO", "TEXT_DOCUMENT", "MULTI_MEDIA",
  ]),
  bodyText: z.string().default(""),
  mediaSpec: z.record(z.string(), z.any()).default({}),
  variables: z.array(variableSchema).default([]),
});

// Create a template + its first version. Spec §10, §43.
export const POST = route(async (req: Request) => {
  const ctx = await requireCap("template:write");
  const body = schema.parse(await req.json());

  // Merge explicit variables with any $tokens discovered in the body text (spec §11).
  const discovered = extractTokens(body.bodyText);
  const byName = new Map(body.variables.map((v) => [v.name, v]));
  for (const name of discovered) {
    if (!byName.has(name)) byName.set(name, { name, required: true, fallbackAllowed: true, usedIn: "text", fallbackValue: null });
  }

  const template = await ctx.db.template.create({
    data: { organizationId: ctx.organizationId, name: body.name, description: body.description, createdBy: ctx.userId, status: "ACTIVE" },
  });

  const version = await ctx.db.templateVersion.create({
    data: {
      organizationId: ctx.organizationId,
      templateId: template.id,
      version: 1,
      messageType: body.messageType,
      bodyText: body.bodyText,
      mediaSpec: body.mediaSpec as any,
      campaignDefinitionId: body.campaignDefinitionId,
      createdBy: ctx.userId,
      variables: { create: [...byName.values()].map((v) => ({ ...v, fallbackValue: v.fallbackValue ?? null })) },
    },
  });

  await ctx.db.template.update({ where: { id: template.id }, data: { currentVersionId: version.id } });
  await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "template.create", entityType: "template", entityId: template.id, metadata: { name: body.name } });
  return json({ template, version }, 201);
});
