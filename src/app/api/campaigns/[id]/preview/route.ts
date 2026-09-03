export const dynamic = "force-dynamic";
import { route, json } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";
import { loadCampaignContext } from "@/lib/services/assemble";
import { interpolate } from "@/lib/variables/engine";
import { buildSerriPayload } from "@/lib/providers/serri";

// WhatsApp-style preview using the ACTUAL recipient data. Spec §24.
export const GET = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireTenant();
  const { id } = await params;
  const url = new URL(req.url);
  const index = Math.max(0, parseInt(url.searchParams.get("i") ?? "0", 10));
  const onlyEligible = url.searchParams.get("eligible") !== "false";

  const total = await ctx.db.campaignRecipient.count({
    where: { campaignId: id, ...(onlyEligible ? { eligible: true } : {}) },
  });
  const recipient = await ctx.db.campaignRecipient.findFirst({
    where: { campaignId: id, ...(onlyEligible ? { eligible: true } : {}) },
    orderBy: { rowNumber: "asc" },
    skip: index,
  });
  if (!recipient) return json({ total, index, recipient: null });

  const cctx = await loadCampaignContext(ctx.organizationId, id);
  const resolved = (recipient.resolvedVariables ?? {}) as any;
  const previewText = interpolate(cctx.bodyText, resolved);
  const payload = buildSerriPayload(cctx.definitionSpec, recipient.destination, resolved, cctx.fallbacks);

  return json({
    total,
    index,
    recipient: {
      name: recipient.name,
      destination: recipient.destination,
      eligible: recipient.eligible,
      exclusionReason: recipient.exclusionReason,
      resolvedVariables: resolved,
    },
    preview: {
      text: previewText,
      media: (payload.media as any) ?? {},
      messageType: cctx.templateVersion.messageType,
    },
  });
});
