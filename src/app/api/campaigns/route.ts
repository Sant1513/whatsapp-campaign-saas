export const dynamic = "force-dynamic";
import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireTenant, requireCap } from "@/lib/tenant";
import { audit } from "@/lib/audit";

export const GET = route(async () => {
  const ctx = await requireTenant();
  const campaigns = await ctx.db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { templateVersion: { include: { template: true } }, serriConnection: true },
  });
  // Aggregate per-campaign message counts (spec §55).
  const withStats = await Promise.all(
    campaigns.map(async (c) => {
      const [recipients, sent, delivered, failed] = await Promise.all([
        ctx.db.campaignRecipient.count({ where: { campaignId: c.id, eligible: true } }),
        ctx.db.message.count({ where: { campaignId: c.id, status: { in: ["SENT", "DELIVERED", "READ"] } } }),
        ctx.db.message.count({ where: { campaignId: c.id, status: { in: ["DELIVERED", "READ"] } } }),
        ctx.db.message.count({ where: { campaignId: c.id, status: "FAILED" } }),
      ]);
      return {
        id: c.id,
        name: c.name,
        status: c.status,
        template: (c as any).templateVersion?.template?.name ?? null,
        scheduledAt: c.scheduledAt,
        createdAt: c.createdAt,
        recipients,
        sent,
        delivered,
        failed,
      };
    }),
  );
  return json({ campaigns: withStats });
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(""),
  templateVersionId: z.string().optional(),
  serriConnectionId: z.string().optional(),
  allowDuplicates: z.boolean().optional().default(false),
});

export const POST = route(async (req: Request) => {
  const ctx = await requireCap("campaign:create");
  const body = createSchema.parse(await req.json());

  // If a template version is provided, seed the field mapping from its variables (auto-match later).
  const campaign = await ctx.db.campaign.create({
    data: {
      organizationId: ctx.organizationId,
      name: body.name,
      description: body.description,
      templateVersionId: body.templateVersionId,
      serriConnectionId: body.serriConnectionId,
      allowDuplicates: body.allowDuplicates,
      timezone: "Asia/Kolkata",
      createdBy: ctx.userId,
      status: "DRAFT",
    },
  });
  await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "campaign.create", entityType: "campaign", entityId: campaign.id, metadata: { name: body.name } });
  return json({ campaign }, 201);
});
