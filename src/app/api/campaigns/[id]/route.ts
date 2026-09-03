import { route, json } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireTenant();
  const { id } = await params;
  const campaign = await ctx.db.campaign.findFirst({
    where: { id },
    include: {
      templateVersion: { include: { template: true, variables: true, campaignDefinition: true } },
      serriConnection: { select: { id: true, name: true, endpoint: true, apiKeyLast4: true, defaultUserName: true, defaultSource: true } },
    },
  });
  if (!campaign) throw Object.assign(new Error("Campaign not found"), { status: 404 });
  return json({ campaign });
});
