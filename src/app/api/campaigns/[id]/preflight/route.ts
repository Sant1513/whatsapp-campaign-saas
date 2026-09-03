export const dynamic = "force-dynamic";
import { route, json } from "@/lib/http";
import { requireCap } from "@/lib/tenant";
import { runPreflight } from "@/lib/services/preflight";

// Spec §52, §70-R10.
export const POST = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCap("campaign:launch");
  const { id } = await params;
  const result = await runPreflight(ctx.organizationId, id);
  return json(result);
});
