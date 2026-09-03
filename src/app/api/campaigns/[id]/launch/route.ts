export const dynamic = "force-dynamic";
import { route, json } from "@/lib/http";
import { requireCap } from "@/lib/tenant";
import { launchCampaign } from "@/lib/services/prepare";

// Send Now. Idempotent; requires a passing preflight (spec §22-step9, §50, §70-R10).
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCap("campaign:launch");
  const { id } = await params;
  const result = await launchCampaign(ctx.organizationId, id, ctx.userId);
  return json(result);
});
