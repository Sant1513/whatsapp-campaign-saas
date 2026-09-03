// Preflight — the hard gate before any send. Spec §23, §52, §70-R10.
import { prisma } from "../db";
import { loadCampaignContext } from "./assemble";

export interface PreflightCheck {
  key: string;
  label: string;
  ok: boolean;
  detail?: string;
}

export interface PreflightResult {
  ok: boolean;
  checks: PreflightCheck[];
  eligible: number;
  excluded: number;
  ranAt: string;
}

export async function runPreflight(organizationId: string, campaignId: string): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  const ctx = await loadCampaignContext(organizationId, campaignId);

  checks.push({ key: "template", label: "Template selected", ok: !!ctx.templateVersion });
  checks.push({ key: "connection", label: "Serri connection selected", ok: !!ctx.connection });

  const [eligible, excluded, missingVarRecipients, invalidUrlRecipients] = await Promise.all([
    prisma.campaignRecipient.count({ where: { campaignId, organizationId, eligible: true } }),
    prisma.campaignRecipient.count({ where: { campaignId, organizationId, eligible: false } }),
    prisma.campaignRecipient.count({
      where: { campaignId, organizationId, eligible: true, exclusionReason: "MISSING_PARAMETER" },
    }),
    prisma.campaignRecipient.count({
      where: { campaignId, organizationId, exclusionReason: { in: ["INVALID_URL", "MISSING_MEDIA"] } },
    }),
  ]);

  checks.push({
    key: "recipients",
    label: "At least one eligible recipient",
    ok: eligible > 0,
    detail: `${eligible} eligible, ${excluded} excluded`,
  });
  checks.push({
    key: "variables",
    label: "All eligible recipients have complete required variables",
    ok: missingVarRecipients === 0,
    detail: missingVarRecipients ? `${missingVarRecipients} incomplete` : "complete",
  });
  checks.push({
    key: "media",
    label: "Required media URLs valid",
    ok: true,
    detail: invalidUrlRecipients ? `${invalidUrlRecipients} excluded for media` : "valid",
  });

  const test = await prisma.campaign.findFirst({ where: { id: campaignId, organizationId } });
  checks.push({
    key: "test",
    label: "Test send performed",
    ok: test?.testStatus === "SUCCESS" || test?.testStatus === "SENT",
    detail: test?.testStatus ?? "not tested",
  });

  // Test send is recommended but the hard gate is: template+connection+eligible+variables.
  const ok =
    checks.filter((c) => ["template", "connection", "recipients", "variables"].includes(c.key)).every((c) => c.ok);

  const result: PreflightResult = {
    ok,
    checks,
    eligible,
    excluded,
    ranAt: new Date().toISOString(),
  };

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      preflight: result as any,
      status: ok ? "READY" : "DRAFT",
    },
  });

  return result;
}
