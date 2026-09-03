import { route, json } from "@/lib/http";
import { requireTenant } from "@/lib/tenant";

// Validation results + exclusion breakdown for a campaign. Spec §20, §21.
export const GET = route(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireTenant();
  const { id } = await params;

  const [eligible, excluded, total, byReason, latestImport] = await Promise.all([
    ctx.db.campaignRecipient.count({ where: { campaignId: id, eligible: true } }),
    ctx.db.campaignRecipient.count({ where: { campaignId: id, eligible: false } }),
    ctx.db.campaignRecipient.count({ where: { campaignId: id } }),
    ctx.db.campaignRecipient.groupBy({
      by: ["exclusionReason"],
      where: { campaignId: id, eligible: false },
      _count: true,
    }),
    ctx.db.import.findFirst({ where: { campaignId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  const reasons: Record<string, number> = {};
  for (const r of byReason as any[]) if (r.exclusionReason) reasons[r.exclusionReason] = r._count;

  return json({
    uploaded: total,
    eligible,
    excluded,
    reasons,
    import: latestImport,
  });
});
