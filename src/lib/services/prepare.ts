// Campaign preparation & launch. Spec §22 (step 9), §28, §31, §50.
// Materializes one Message per ELIGIBLE recipient with a deterministic idempotencyKey, then
// enqueues one job per message (jobId == idempotencyKey) so retries/refresh can't double-send.
import { prisma } from "../db";
import { assertTransition, type CampaignStatus } from "../campaign/state";
import { campaignMessageKey } from "../idempotency";
import { loadCampaignContext } from "./assemble";
import { buildSerriPayload, redactPayload } from "../providers/serri";
import { env } from "../env";
import { audit } from "../audit";

export interface PrepareResult {
  campaignId: string;
  messagesCreated: number;
  alreadyPrepared: number;
}

/**
 * Launch a campaign: DRAFT/READY/SCHEDULED → PREPARING → SENDING.
 * Requires a passing preflight snapshot (spec §10-R10, §52). Idempotent: safe to call twice.
 */
export async function launchCampaign(
  organizationId: string,
  campaignId: string,
  actorUserId: string,
): Promise<PrepareResult> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
  if (!campaign) throw Object.assign(new Error("Campaign not found"), { status: 404 });

  const preflight = campaign.preflight as any;
  if (!preflight?.ok) {
    throw Object.assign(new Error("Preflight has not passed. Run preflight first."), { status: 409 });
  }

  // Transition DRAFT/READY/SCHEDULED → PREPARING → SENDING before any message is processed,
  // so worker/inline completion callbacks observe the SENDING state and can finalize the
  // campaign to COMPLETED/PARTIALLY_COMPLETED/FAILED (spec §31).
  assertTransition(campaign.status as CampaignStatus, "PREPARING");
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "PREPARING" } });
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: "SENDING" } });

  const ctx = await loadCampaignContext(organizationId, campaignId);

  const eligible = await prisma.campaignRecipient.findMany({
    where: { campaignId, organizationId, eligible: true },
  });

  let created = 0;
  let already = 0;

  for (const r of eligible) {
    const key = campaignMessageKey(campaignId, r.id);
    const resolvedVars = (r.resolvedVariables ?? {}) as any;

    // Rebuild the exact payload from the stored resolved variables (snapshot, spec §46/§70-R6).
    const payload = buildSerriPayload(
      ctx.definitionSpec,
      r.destination,
      resolvedVars,
      ctx.fallbacks,
    );

    try {
      await prisma.message.create({
        data: {
          organizationId,
          campaignId,
          campaignRecipientId: r.id,
          contactId: r.contactId,
          templateId: ctx.templateVersion.templateId,
          templateVersionId: ctx.templateVersion.id,
          destination: r.destination,
          resolvedVariables: resolvedVars,
          resolvedPayload: redactPayload({ apiKey: "__STORED_SERVER_SIDE__", ...payload }) as any,
          mediaSnapshot: (payload.media as any) ?? {},
          status: "PENDING",
          idempotencyKey: key,
          queuedAt: new Date(),
        },
      });
      created++;
    } catch (e: any) {
      // Unique idempotencyKey violation => already prepared. Not an error (spec §50).
      if (e?.code === "P2002") {
        already++;
        continue;
      }
      throw e;
    }

    if (env.DEMO_INLINE_SEND) {
      // Dev/demo path: no Redis. Process the message synchronously (dry-run by default).
      const { processSendJob } = await import("./send");
      await processSendJob({ idempotencyKey: key, organizationId, campaignId }, 0);
    } else {
      // Production path: enqueue to BullMQ; a worker sends it (spec §28, §70-R8).
      const { sendQueue } = await import("../queue/queues");
      await sendQueue.add(
        "send",
        { idempotencyKey: key, organizationId, campaignId },
        {
          jobId: key, // idempotent enqueue
          attempts: env.SEND_MAX_ATTEMPTS,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      );
    }
  }

  // In inline demo mode, every message is already processed above, so finalize the campaign
  // status now (the real queue path is finalized by the worker's recomputeCampaign).
  if (env.DEMO_INLINE_SEND) {
    const { recomputeCampaign } = await import("./send");
    await recomputeCampaign(campaignId, organizationId);
  }
  await audit({
    organizationId,
    userId: actorUserId,
    action: "campaign.launch",
    entityType: "campaign",
    entityId: campaignId,
    metadata: { messagesCreated: created, alreadyPrepared: already, mode: env.SERRI_MODE },
  });

  return { campaignId, messagesCreated: created, alreadyPrepared: already };
}
