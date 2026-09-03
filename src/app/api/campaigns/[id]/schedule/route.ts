export const dynamic = "force-dynamic";
import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireCap } from "@/lib/tenant";
import { assertTransition } from "@/lib/campaign/state";
import { scheduleQueue } from "@/lib/queue/queues";
import { audit } from "@/lib/audit";

const schema = z.object({ runAt: z.string().datetime() });

// Schedule for later. Persisted + delayed BullMQ job. Not dependent on the browser. Spec §30.
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCap("campaign:launch");
  const { id } = await params;
  const { runAt } = schema.parse(await req.json());
  const when = new Date(runAt);
  if (when.getTime() <= Date.now()) throw Object.assign(new Error("runAt must be in the future"), { status: 400 });

  const campaign = await ctx.db.campaign.findFirst({ where: { id } });
  if (!campaign) throw Object.assign(new Error("Campaign not found"), { status: 404 });
  if (!(campaign.preflight as any)?.ok) throw Object.assign(new Error("Preflight has not passed"), { status: 409 });

  assertTransition(campaign.status as any, "SCHEDULED");
  await ctx.db.campaign.update({ where: { id }, data: { status: "SCHEDULED", scheduledAt: when } });
  const sched = await ctx.db.scheduledJob.create({ data: { organizationId: ctx.organizationId, campaignId: id, runAt: when } });

  await scheduleQueue.add(
    "launch",
    { campaignId: id, organizationId: ctx.organizationId },
    { jobId: `sched_${sched.id}`, delay: Math.max(0, when.getTime() - Date.now()) },
  );
  await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "campaign.schedule", entityType: "campaign", entityId: id, metadata: { runAt } });

  return json({ ok: true, scheduledAt: when });
});
