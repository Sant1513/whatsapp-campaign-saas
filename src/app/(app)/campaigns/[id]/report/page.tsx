export const dynamic = "force-dynamic";
import { requireTenant } from "@/lib/tenant";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/ReportView";

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireTenant();
  const campaign = await ctx.db.campaign.findFirst({ where: { id } });
  if (!campaign) notFound();
  return <ReportView campaignId={id} campaignName={campaign.name} />;
}
