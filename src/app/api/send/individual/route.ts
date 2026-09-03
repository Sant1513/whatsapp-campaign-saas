import { z } from "zod";
import { route, json } from "@/lib/http";
import { requireCap } from "@/lib/tenant";
import { decryptSecret } from "@/lib/crypto";
import { validatePhone } from "@/lib/validation/phone";
import { resolveVariables, type VariableDef } from "@/lib/variables/engine";
import { buildSerriPayload, redactPayload, serriProvider, type DefinitionSpec } from "@/lib/providers/serri";
import { oneOffKey } from "@/lib/idempotency";
import { audit } from "@/lib/audit";

// Individual send — SAME engine, validation, payload builder, adapter, logging as bulk. Spec §26, §53.
const schema = z.object({
  templateVersionId: z.string(),
  serriConnectionId: z.string(),
  phone: z.string().min(3),
  name: z.string().optional().default(""),
  variables: z.record(z.string(), z.string()).default({}),
  test: z.boolean().optional().default(false),
  actionId: z.string().min(8), // idempotency: one user action == one key (spec §50)
});

export const POST = route(async (req: Request) => {
  const ctx = await requireCap("campaign:test");
  const body = schema.parse(await req.json());

  const phone = validatePhone(body.phone);
  if (!phone.valid) throw Object.assign(new Error("Invalid phone number"), { status: 422 });

  const tv = await ctx.db.templateVersion.findFirst({
    where: { id: body.templateVersionId },
    include: { variables: true, campaignDefinition: true, template: true },
  });
  if (!tv) throw Object.assign(new Error("Template not found"), { status: 404 });
  const conn = await ctx.db.serriConnection.findFirst({ where: { id: body.serriConnectionId } });
  if (!conn) throw Object.assign(new Error("Connection not found"), { status: 404 });

  const variables: VariableDef[] = tv.variables.map((v: any) => ({
    name: v.name, required: v.required, fallbackValue: v.fallbackValue, fallbackAllowed: v.fallbackAllowed, usedIn: v.usedIn,
  }));
  const defJson = (tv.campaignDefinition.spec ?? {}) as any;
  const spec: DefinitionSpec = {
    serriCampaignName: tv.campaignDefinition.serriCampaignName,
    userName: conn.defaultUserName,
    source: conn.defaultSource,
    templateParamOrder: Array.isArray(defJson.templateParamOrder) ? defJson.templateParamOrder : variables.map((v) => v.name),
    media: (tv.mediaSpec as any)?.required ? (tv.mediaSpec as any) : defJson.media,
  };
  const fallbacks: Record<string, string> = {};
  for (const v of variables) if (v.fallbackAllowed && v.fallbackValue) fallbacks[v.name] = v.fallbackValue;

  const res = resolveVariables(variables, {}, body.variables);
  if (!res.ok) throw Object.assign(new Error(`Missing required: ${res.missingRequired.join(", ")}`), { status: 422 });

  const payload = buildSerriPayload(spec, phone.normalized!, res.variables, fallbacks);
  const key = oneOffKey(body.test ? "test" : "individual", body.actionId);
  const apiKey = decryptSecret(conn.apiKeyCipher);

  const send = body.test
    ? await serriProvider.sendTestMessage({ apiKey, endpoint: conn.endpoint, payload, idempotencyKey: key })
    : await serriProvider.sendMessage({ apiKey, endpoint: conn.endpoint, payload, idempotencyKey: key });

  try {
    await ctx.db.message.create({
      data: {
        organizationId: ctx.organizationId,
        templateId: tv.templateId,
        templateVersionId: tv.id,
        destination: phone.normalized!,
        resolvedVariables: res.variables as any,
        resolvedPayload: redactPayload({ apiKey: "__STORED_SERVER_SIDE__", ...payload }),
        mediaSnapshot: (payload.media as any) ?? {},
        status: send.outcome === "SENT" ? "SENT" : send.outcome === "UNKNOWN" ? "UNKNOWN" : "FAILED",
        failureReason: send.reason,
        providerRef: send.providerRef,
        isTest: body.test,
        idempotencyKey: key,
        sentAt: send.outcome === "SENT" ? new Date() : undefined,
      },
    });
  } catch (e: any) {
    if (e?.code !== "P2002") throw e; // duplicate action == idempotent no-op (spec §50)
  }

  await audit({ organizationId: ctx.organizationId, userId: ctx.userId, action: body.test ? "send.individual_test" : "send.individual", entityType: "message", metadata: { destination: phone.normalized } });
  return json({ outcome: send.outcome, reason: send.reason, dryRun: (send.responseBody as any)?.dryRun ?? false });
});
