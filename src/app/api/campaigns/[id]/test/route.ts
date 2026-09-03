export const dynamic = "force-dynamic";
import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireCap } from "@/lib/tenant";
import { loadCampaignContext, decryptConnectionKey } from "@/lib/services/assemble";
import { buildSerriPayload, redactPayload, serriProvider } from "@/lib/providers/serri";
import { validatePhone } from "@/lib/validation/phone";
import { resolveVariables } from "@/lib/variables/engine";
import { oneOffKey, randomActionId } from "@/lib/idempotency";
import { audit } from "@/lib/audit";

const schema = z.object({
  phones: z.array(z.string()).min(1).max(5),
  variables: z.record(z.string(), z.string()).optional().default({}),
});

// Test send using the REAL Serri adapter (dry-run by default). Labeled as a test. Spec §7-step7, §27.
export const POST = route(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const ctx = await requireCap("campaign:test");
  const { id } = await params;
  const body = schema.parse(await req.json());

  const cctx = await loadCampaignContext(ctx.organizationId, id);
  const apiKey = decryptConnectionKey(cctx);

  const results: any[] = [];
  for (const rawPhone of body.phones) {
    const phone = validatePhone(rawPhone);
    if (!phone.valid) {
      results.push({ phone: rawPhone, outcome: "FAILED", reason: "INVALID_PHONE" });
      continue;
    }
    const res = resolveVariables(cctx.variables, {}, body.variables); // direct values, no CSV mapping
    const payload = buildSerriPayload(cctx.definitionSpec, phone.normalized!, res.variables, cctx.fallbacks);
    const key = oneOffKey("test", randomActionId());

    const send = await serriProvider.sendTestMessage({
      apiKey,
      endpoint: cctx.connection.endpoint,
      payload,
      idempotencyKey: key,
    });

    await ctx.db.message.create({
      data: {
        organizationId: ctx.organizationId,
        campaignId: id,
        templateId: cctx.templateVersion.templateId,
        templateVersionId: cctx.templateVersion.id,
        destination: phone.normalized!,
        resolvedVariables: res.variables as any,
        resolvedPayload: redactPayload({ apiKey: "__TEST__", ...payload }),
        mediaSnapshot: (payload.media as any) ?? {},
        status: send.outcome === "SENT" ? "SENT" : send.outcome === "UNKNOWN" ? "UNKNOWN" : "FAILED",
        failureReason: send.reason,
        providerRef: send.providerRef,
        isTest: true,
        idempotencyKey: key,
        sentAt: send.outcome === "SENT" ? new Date() : undefined,
      },
    });

    results.push({
      phone: phone.normalized,
      outcome: send.outcome,
      httpStatus: send.httpStatus,
      reason: send.reason,
      dryRun: (send.responseBody as any)?.dryRun ?? false,
    });
  }

  const anySent = results.some((r) => r.outcome === "SENT");
  await ctx.db.campaign.update({
    where: { id },
    data: { testStatus: anySent ? "SUCCESS" : "FAILED" },
  });
  await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: "campaign.test", entityType: "campaign", entityId: id, metadata: { count: body.phones.length } });

  return json({ results, testStatus: anySent ? "SUCCESS" : "FAILED" });
});
