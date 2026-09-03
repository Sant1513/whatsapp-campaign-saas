import { notFound } from "next/navigation";
import { requireTenant } from "@/lib/tenant";
import { CampaignBuilder } from "@/components/CampaignBuilder";

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenant();
  const campaign = await ctx.db.campaign.findFirst({
    where: { id },
    include: {
      templateVersion: { include: { template: true, variables: true, campaignDefinition: true } },
      serriConnection: { select: { name: true, apiKeyLast4: true } },
    },
  });
  if (!campaign) notFound();

  const latestImport = await ctx.db.import.findFirst({ where: { campaignId: id }, orderBy: { createdAt: "desc" } });

  return (
    <CampaignBuilder
      campaign={{
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        allowDuplicates: campaign.allowDuplicates,
        fieldMapping: (campaign.fieldMapping ?? {}) as Record<string, string>,
        preflight: campaign.preflight as any,
        testStatus: campaign.testStatus,
        template: campaign.templateVersion
          ? {
              name: (campaign as any).templateVersion.template.name,
              version: (campaign as any).templateVersion.version,
              messageType: (campaign as any).templateVersion.messageType,
              serriCampaign: (campaign as any).templateVersion.campaignDefinition.serriCampaignName,
              variables: (campaign as any).templateVersion.variables.map((v: any) => ({
                name: v.name, required: v.required, fallbackValue: v.fallbackValue, fallbackAllowed: v.fallbackAllowed,
              })),
            }
          : null,
        connection: campaign.serriConnection ? { name: (campaign as any).serriConnection.name, last4: (campaign as any).serriConnection.apiKeyLast4 } : null,
      }}
      headers={latestImport?.headers ?? []}
    />
  );
}
