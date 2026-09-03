import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireCap } from "@/lib/tenant";
import { assertTransition } from "@/lib/campaign/state";
import { sendQueue } from "@/lib/queue/queues";
import { campaignMessageKey } from "@/lib/idempotency";
import { audit } from "@/lib/audit";

const schema = z.object({ action: z.enum(["pause", "resume", "cancel"]) });

// Pause / resume / cancel a sending campaign. Spec §32.
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCap("campaign:control");
  const { id } = await params;
  const { action } = schema.parse(await req.json());

  const campaign = await ctx.db.campaign.findFirst({ where: { id } });
  if (!campaign) throw Object.assign(new Error("Campaign not found"), { status: 404 });

  if (action === "pause") {
    assertTransition(campaign.status as any, "PAUSED");
    await ctx.db.campaign.update({ where: { id }, data: { status: "PAUSED" } });
  } else if (action === "resume") {
    assertTransition(campaign.status as any, "SENDING");
    await ctx.db.campaign.update({ where: { id }, data: { status: "SENDING" } });
    // Re-enqueue any messages still PENDING (spec §32 — pause stops new entry, resume continues).
    const pending = await ctx.db.message.findMany({
      where: { campaignId: id, status: "PENDING" },
      select: { campaignRecipientId: true },
    });
    for (const m of pending) {
      if (!m.campaignRecipientId) continue;
      const key = campaignMessageKey(id, m.campaignRecipientId);
      await sendQueue.add("send", { idempotencyKey: key, organizationId: ctx.organizationId, campaignId: id }, { jobId: key });
    }
  } else {
    assertTransition(campaign.status as any, "CANCELLED");
    await ctx.db.campaign.update({ where: { id }, data: { status: "CANCELLED" } });
    // Mark still-pending messages as cancelled so no new sends occur.
    await ctx.db.message.updateMany({ where: { campaignId: id, status: "PENDING" }, data: { status: "CANCELLED" } });
  }

  await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: `campaign.${action}`, entityType: "campaign", entityId: id });
  return json({ ok: true, action });
});
