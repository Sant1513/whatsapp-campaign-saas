import { route, json } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { loadCampaignContext } from "@/lib/services/assemble";
import { buildSerriPayload } from "@/lib/providers/serri";
import { maskKey } from "@/lib/crypto";

// Advanced developer view: the generated Serri request with the API key MASKED. Spec §25.
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireTenant();
  const { id } = await params;
  const index = Math.max(0, parseInt(new URL(req.url).searchParams.get("i") ?? "0", 10));

  const recipient = await ctx.db.campaignRecipient.findFirst({
    where: { campaignId: id, eligible: true },
    orderBy: { rowNumber: "asc" },
    skip: index,
  });
  if (!recipient) return json({ recipient: null });

  const cctx = await loadCampaignContext(ctx.organizationId, id);
  const payload = buildSerriPayload(
    cctx.definitionSpec,
    recipient.destination,
    (recipient.resolvedVariables ?? {}) as any,
    cctx.fallbacks,
  );

  return json({
    method: "POST",
    endpoint: cctx.connection.endpoint,
    headers: { "Content-Type": "application/json" },
    // API key ALWAYS masked (spec §25, §70-R4)
    payload: { apiKey: maskKey((cctx.connection as any).apiKeyLast4 ?? "0000"), ...payload },
  });
});
