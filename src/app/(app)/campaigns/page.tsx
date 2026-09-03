import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { StatusBadge } from "@/components/StatusBadge";

export default async function CampaignsPage() {
  const ctx = await requireTenant();
  const campaigns = await ctx.db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { templateVersion: { include: { template: true } } },
  });

  const stats = await Promise.all(
    campaigns.map(async (c) => ({
      id: c.id,
      recipients: await ctx.db.campaignRecipient.count({ where: { campaignId: c.id, eligible: true } }),
      sent: await ctx.db.message.count({ where: { campaignId: c.id, status: { in: ["SENT", "DELIVERED", "READ"] } } }),
      failed: await ctx.db.message.count({ where: { campaignId: c.id, status: "FAILED" } }),
    })),
  );
  const statById = new Map(stats.map((s) => [s.id, s]));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Campaigns</h1>
        <Link href="/campaigns/new" className="btn-primary">Create Campaign</Link>
      </div>

      {campaigns.length === 0 ? (
        <div className="card py-16 text-center">
          <p className="text-gray-500">No campaigns yet.</p>
          <p className="mt-1 text-sm text-gray-400">Create your first campaign to start sending WhatsApp messages.</p>
          <Link href="/campaigns/new" className="btn-primary mt-4">Create Campaign</Link>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr>
                <th className="pb-2">Campaign</th>
                <th className="pb-2">Template</th>
                <th className="pb-2">Recipients</th>
                <th className="pb-2">Sent</th>
                <th className="pb-2">Failed</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Created</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c: any) => {
                const s = statById.get(c.id)!;
                return (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className="py-2"><Link href={`/campaigns/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name}</Link></td>
                    <td className="py-2 text-gray-600">{c.templateVersion?.template?.name ?? "—"}</td>
                    <td className="py-2">{s.recipients}</td>
                    <td className="py-2">{s.sent}</td>
                    <td className="py-2">{s.failed}</td>
                    <td className="py-2"><StatusBadge status={c.status} /></td>
                    <td className="py-2 text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
