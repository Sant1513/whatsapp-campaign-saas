import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireCap } from "@/lib/tenant";
import { audit } from "@/lib/audit";

const schema = z.object({ name: z.string().min(1).max(200) });

// Duplicate a campaign: copies config/template/mapping/media, NOT execution results. Spec §37.
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCap("campaign:create");
  const { id } = await params;
  const { name } = schema.parse(await req.json());

  const src = await ctx.db.campaign.findFirst({ where: { id } });
  if (!src) throw Object.assign(new Error("Campaign not found"), { status: 404 });

  const copy = await ctx.db.campaign.create({
    data: {
      organizationId: ctx.organizationId,
      name,
      description: src.description,
      templateVersionId: src.templateVersionId,
      serriConnectionId: src.serriConnectionId,
      fieldMapping: src.fieldMapping as any, // copy mapping/media config
      allowDuplicates: src.allowDuplicates,
      timezone: src.timezone,
      duplicatedFromId: src.id,
      createdBy: ctx.userId,
      status: "DRAFT",
      // NOT copied: recipients, messages, preflight, testStatus, schedule (spec §37).
    },
  });
  await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "campaign.duplicate", entityType: "campaign", entityId: copy.id, metadata: { from: src.id } });
  return json({ campaign: copy }, 201);
});
