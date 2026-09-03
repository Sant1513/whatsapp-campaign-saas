export const dynamic = "force-dynamic";
import Link from "next/link";
import { requireTenant } from "@/lib/tenant";
import { StatusBadge } from "@/components/StatusBadge";

export default async function DashboardPage() {
  const ctx = await requireTenant();
  const db = ctx.db;

  const [total, active, scheduled, completed, failed] = await Promise.all([
    db.campaign.count(),
    db.campaign.count({ where: { status: { in: ["SENDING", "PREPARING"] } } }),
    db.campaign.count({ where: { status: "SCHEDULED" } }),
    db.campaign.count({ where: { status: { in: ["COMPLETED", "PARTIALLY_COMPLETED"] } } }),
    db.campaign.count({ where: { status: "FAILED" } }),
  ]);

  const [recipients, sent, delivered, read, msgFailed, excluded] = await Promise.all([
    db.campaignRecipient.count({ where: { eligible: true } }),
    db.message.count({ where: { status: { in: ["SENT", "DELIVERED", "READ"] } } }),
    db.message.count({ where: { status: { in: ["DELIVERED", "READ"] } } }),
    db.message.count({ where: { status: "READ" } }),
    db.message.count({ where: { status: "FAILED" } }),
    db.campaignRecipient.count({ where: { eligible: false } }),
  ]);

  const recent = await db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
    include: { templateVersion: { include: { template: true } } },
  });

  const campaignStats = [
    { label: "Total", value: total },
    { label: "Active", value: active },
    { label: "Scheduled", value: scheduled },
    { label: "Completed", value: completed },
    { label: "Failed", value: failed },
  ];
  const msgStats = [
    { label: "Recipients", value: recipients },
    { label: "Sent", value: sent },
    { label: "Delivered", value: delivered },
    { label: "Read", value: read },
    { label: "Failed", value: msgFailed },
    { label: "Excluded", value: excluded },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex gap-2">
          <Link href="/campaigns/new" className="btn-primary">Create Campaign</Link>
          <Link href="/templates" className="btn-secondary">Create Template</Link>
          <Link href="/contacts" className="btn-secondary">Import Contacts</Link>
        </div>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Campaigns</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          {campaignStats.map((s) => (
            <div key={s.label} className="card">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-500">Messaging</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
          {msgStats.map((s) => (
            <div key={s.label} className="card">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className="mt-1 text-2xl font-semibold">{s.value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-3 text-sm font-semibold text-gray-500">Recent Campaigns</h2>
        {recent.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">
            No campaigns yet. <Link href="/campaigns/new" className="text-brand-700 underline">Create your first campaign</Link>.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400">
                <tr>
                  <th className="pb-2">Campaign</th>
                  <th className="pb-2">Template</th>
                  <th className="pb-2">Status</th>
                  <th className="pb-2">Created</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c: any) => (
                  <tr key={c.id} className="border-t border-gray-100">
                    <td className="py-2">
                      <Link href={`/campaigns/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.name}</Link>
                    </td>
                    <td className="py-2 text-gray-600">{c.templateVersion?.template?.name ?? "—"}</td>
                    <td className="py-2"><StatusBadge status={c.status} /></td>
                    <td className="py-2 text-gray-500">{new Date(c.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
