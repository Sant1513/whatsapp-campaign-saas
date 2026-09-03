// Per-message send logic executed by the worker. Spec §27, §28, §29, §33, §49, §50, §70.
// Guarantees: never double-send (jobId + idempotencyKey + guarded claim + provider Idempotency
// header), never claim delivered on timeout (UNKNOWN), retry only transient failures.
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import { serriProvider } from "../providers/serri";
import { DEFAULT_RETRY, shouldRetry } from "../retry";
import { env } from "../env";
import type { SendJobData } from "../queue/queues";

const TERMINAL = new Set(["SENT", "DELIVERED", "READ", "FAILED", "CANCELLED", "EXCLUDED"]);

export interface SendOutcomeSummary {
  status: string;
  skipped?: boolean;
}

export async function processSendJob(
  data: SendJobData,
  attemptsMade: number,
  maxAttempts = env.SEND_MAX_ATTEMPTS,
): Promise<SendOutcomeSummary> {
  const message = await prisma.message.findUnique({
    where: { idempotencyKey: data.idempotencyKey },
    include: { campaign: { include: { serriConnection: true } } },
  });
  if (!message) return { status: "MISSING", skipped: true };
  if (TERMINAL.has(message.status)) return { status: message.status, skipped: true };

  const campaign = message.campaign;
  // Respect pause/cancel (spec §32).
  if (campaign?.status === "CANCELLED") {
    await prisma.message.update({ where: { id: message.id }, data: { status: "CANCELLED" } });
    return { status: "CANCELLED" };
  }
  if (campaign?.status === "PAUSED") {
    // Leave PENDING; resume re-enqueues. Do not enter execution.
    return { status: "PAUSED", skipped: true };
  }

  const conn = campaign?.serriConnection;
  if (!conn) {
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "FAILED", failureReason: "no_connection", failedAt: new Date() },
    });
    return { status: "FAILED" };
  }

  // Guarded claim PENDING/UNKNOWN → PROCESSING (BullMQ runs one job at a time per jobId).
  await prisma.message.update({ where: { id: message.id }, data: { status: "PROCESSING" } });

  // Strip the stored apiKey placeholder; the real key is injected here only.
  const payload = { ...(message.resolvedPayload as Record<string, unknown>) };
  delete (payload as any).apiKey;

  const apiKey = decryptSecret(conn.apiKeyCipher);
  const result = await serriProvider.sendMessage({
    apiKey,
    endpoint: conn.endpoint,
    payload,
    idempotencyKey: message.idempotencyKey,
  });

  const attemptNumber = attemptsMade + 1;
  await prisma.messageAttempt.create({
    data: {
      messageId: message.id,
      attemptNumber,
      outcome: result.outcome,
      httpStatus: result.httpStatus,
      errorClass: result.errorClass,
      responseBody: (result.responseBody ?? null) as any,
      durationMs: result.durationMs,
    },
  });

  const isLastAttempt = attemptNumber >= maxAttempts;

  if (result.outcome === "SENT") {
    await finalize(message.id, {
      status: "SENT",
      sentAt: new Date(),
      providerRef: result.providerRef,
      attemptCount: attemptNumber,
    });
    await recomputeCampaign(data.campaignId, data.organizationId);
    return { status: "SENT" };
  }

  const retry = shouldRetry(result, attemptNumber, {
    ...DEFAULT_RETRY,
    maxAttempts,
  });

  if (retry && !isLastAttempt) {
    // Reset to PENDING so the guarded claim passes on retry, then throw to let BullMQ re-run.
    await prisma.message.update({
      where: { id: message.id },
      data: { status: "PENDING", attemptCount: attemptNumber },
    });
    throw new Error(`retryable:${result.reason ?? result.outcome}`);
  }

  // No more retries. Never mark a timeout/ambiguous result as "not sent" — keep UNKNOWN.
  const finalStatus = result.outcome === "UNKNOWN" ? "UNKNOWN" : "FAILED";
  await finalize(message.id, {
    status: finalStatus,
    failureReason: result.reason,
    failedAt: finalStatus === "FAILED" ? new Date() : undefined,
    attemptCount: attemptNumber,
  });
  await recomputeCampaign(data.campaignId, data.organizationId);
  return { status: finalStatus };
}

async function finalize(
  messageId: string,
  data: {
    status: string;
    sentAt?: Date;
    failedAt?: Date;
    providerRef?: string;
    failureReason?: string;
    attemptCount: number;
  },
) {
  await prisma.message.update({ where: { id: messageId }, data: data as any });
}

/**
 * Recompute campaign aggregate status once no messages remain in-flight. Spec §31.
 * COMPLETED (all sent-ish), PARTIALLY_COMPLETED (some failed), FAILED (all failed).
 */
export async function recomputeCampaign(campaignId: string, organizationId: string) {
  const inflight = await prisma.message.count({
    where: { campaignId, organizationId, status: { in: ["PENDING", "PROCESSING"] } },
  });
  if (inflight > 0) return;

  const [sentish, failed, total] = await Promise.all([
    prisma.message.count({
      where: { campaignId, organizationId, status: { in: ["SENT", "DELIVERED", "READ", "UNKNOWN"] } },
    }),
    prisma.message.count({ where: { campaignId, organizationId, status: "FAILED" } }),
    prisma.message.count({ where: { campaignId, organizationId } }),
  ]);

  let status: string;
  if (total === 0) status = "COMPLETED";
  else if (failed === 0) status = "COMPLETED";
  else if (sentish === 0) status = "FAILED";
  else status = "PARTIALLY_COMPLETED";

  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
  if (campaign && campaign.status === "SENDING") {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: status as any } });
  }
}
