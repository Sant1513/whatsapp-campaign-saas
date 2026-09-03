// Message assembly — the ONE path that turns (campaign, recipient row) into a validated Serri
// payload + immutable snapshot. Shared by campaign send, test, individual, preview, payload
// preview (spec §26, §53). Never called from the browser.
import { prisma } from "../db";
import { decryptSecret } from "../crypto";
import {
  resolveVariables,
  interpolate,
  type VariableDef,
  type ResolvedVariable,
  type FieldMapping,
} from "../variables/engine";
import { buildSerriPayload, redactPayload, type DefinitionSpec } from "../providers/serri";
import { validatePhone } from "../validation/phone";

export interface CampaignContext {
  campaign: any;
  templateVersion: any;
  variables: VariableDef[];
  definitionSpec: DefinitionSpec;
  connection: { id: string; endpoint: string; apiKeyCipher: string; defaultUserName: string; defaultSource: string };
  mapping: FieldMapping;
  bodyText: string;
  fallbacks: Record<string, string>;
}

/** Load everything needed to assemble messages for a campaign (org-scoped). */
export async function loadCampaignContext(organizationId: string, campaignId: string): Promise<CampaignContext> {
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, organizationId },
    include: {
      serriConnection: true,
      templateVersion: {
        include: { variables: true, campaignDefinition: true },
      },
    },
  });
  if (!campaign) throw Object.assign(new Error("Campaign not found"), { status: 404 });
  if (!campaign.templateVersion) throw Object.assign(new Error("Campaign has no template"), { status: 400 });
  if (!campaign.serriConnection) throw Object.assign(new Error("Campaign has no Serri connection"), { status: 400 });

  const tv = campaign.templateVersion;
  const variables: VariableDef[] = tv.variables.map((v: any) => ({
    name: v.name,
    required: v.required,
    fallbackValue: v.fallbackValue,
    fallbackAllowed: v.fallbackAllowed,
    usedIn: v.usedIn,
  }));

  const defJson = (tv.campaignDefinition.spec ?? {}) as any;
  const definitionSpec: DefinitionSpec = {
    serriCampaignName: tv.campaignDefinition.serriCampaignName,
    userName: campaign.serriConnection.defaultUserName,
    source: campaign.serriConnection.defaultSource,
    templateParamOrder: Array.isArray(defJson.templateParamOrder)
      ? defJson.templateParamOrder
      : variables.map((v) => v.name),
    media: (tv.mediaSpec as any)?.required ? (tv.mediaSpec as any) : defJson.media,
    buttons: defJson.buttons,
    carouselCards: defJson.carouselCards,
    location: defJson.location,
    attributes: defJson.attributes,
  };

  const fallbacks: Record<string, string> = {};
  for (const v of variables) {
    if (v.fallbackAllowed && v.fallbackValue) fallbacks[v.name] = v.fallbackValue;
  }

  return {
    campaign,
    templateVersion: tv,
    variables,
    definitionSpec,
    connection: campaign.serriConnection,
    mapping: (campaign.fieldMapping ?? {}) as FieldMapping,
    bodyText: tv.bodyText ?? "",
    fallbacks,
  };
}

export interface AssembledMessage {
  destination: string;
  resolvedVariables: Record<string, ResolvedVariable>;
  payload: Record<string, unknown>;   // WITHOUT apiKey
  redactedPayload: Record<string, unknown>;
  previewText: string;
  ok: boolean;
  reason?: string;
}

/** Pure assembly from a raw row (already mapped). Does not touch the network. */
export function assembleFromRow(
  ctx: CampaignContext,
  row: Record<string, unknown>,
  phoneVar = "Phone",
): AssembledMessage {
  const res = resolveVariables(ctx.variables, ctx.mapping, row);
  const phoneCol = ctx.mapping[phoneVar] ?? phoneVar;
  const phone = validatePhone(row[phoneCol]);
  const destination = phone.normalized ?? "";

  const payload = buildSerriPayload(ctx.definitionSpec, destination, res.variables, ctx.fallbacks);
  const previewText = interpolate(ctx.bodyText, res.variables);

  return {
    destination,
    resolvedVariables: res.variables,
    payload,
    redactedPayload: redactPayload({ apiKey: "__REDACTED__", ...payload }),
    previewText,
    ok: res.ok && phone.valid,
    reason: !phone.valid ? "INVALID_PHONE" : !res.ok ? "MISSING_PARAMETER" : undefined,
  };
}

/** Decrypt the connection's API key — backend only, at the moment of transmit. */
export function decryptConnectionKey(ctx: CampaignContext): string {
  return decryptSecret(ctx.connection.apiKeyCipher);
}
