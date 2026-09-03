export const dynamic = "force-dynamic";
import { requireTenant } from "@/lib/tenant";
import { NewCampaignForm } from "@/components/NewCampaignForm";

export default async function NewCampaignPage() {
  const ctx = await requireTenant();
  const [templates, connections] = await Promise.all([
    ctx.db.template.findMany({
      where: { status: "ACTIVE" },
      include: { currentVersion: { include: { campaignDefinition: true, variables: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    ctx.db.serriConnection.findMany({ where: { status: "ACTIVE" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Create Campaign</h1>
      <NewCampaignForm
        templates={templates.map((t: any) => ({
          id: t.id,
          name: t.name,
          versionId: t.currentVersion?.id ?? null,
          version: t.currentVersion?.version ?? null,
          messageType: t.currentVersion?.messageType ?? null,
          serriCampaign: t.currentVersion?.campaignDefinition?.serriCampaignName ?? null,
          variables: t.currentVersion?.variables?.map((v: any) => v.name) ?? [],
        }))}
        connections={connections}
      />
    </div>
  );
}
