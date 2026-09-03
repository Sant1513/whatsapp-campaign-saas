import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { StatusBadge } from "@/components/StatusBadge";

export default async function ReportsPage() {
  const ctx = await requireTenant();
  const campaigns = await ctx.db.campaign.findMany({
    where: { status: { in: ["SENDING", "COMPLETED", "PARTIALLY_COMPLETED", "FAILED", "CANCELLED"] } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      {campaigns.length === 0 ? (
        <div className="card py-16 text-center text-sm text-gray-500">No campaign reports yet. Launch a campaign to see reporting.</div>
      ) : (
        <div className="card divide-y divide-gray-100">
          {campaigns.map((c) => (
            <Link key={c.id} href={`/campaigns/${c.id}/report`} className="flex items-center justify-between py-3 hover:bg-gray-50">
              <span className="font-medium text-brand-700">{c.name}</span>
              <StatusBadge status={c.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
