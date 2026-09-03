import { requireTenant } from "@/lib/tenant";
import { StatusBadge } from "@/components/StatusBadge";
import { maskPhone } from "@/lib/format";

export default async function HistoryPage() {
  const ctx = await requireTenant();
  const messages = await ctx.db.message.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { campaign: { select: { name: true } }, templateVersion: { include: { template: { select: { name: true } } } } },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Message History</h1>
      {messages.length === 0 ? (
        <div className="card py-16 text-center text-sm text-gray-500">No messages yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr><th className="pb-2">Phone</th><th className="pb-2">Campaign</th><th className="pb-2">Template</th><th className="pb-2">Status</th><th className="pb-2">When</th></tr>
            </thead>
            <tbody>
              {messages.map((m: any) => (
                <tr key={m.id} className="border-t border-gray-100">
                  <td className="py-2 font-mono">{maskPhone(m.destination)}{m.isTest && <span className="ml-2 badge bg-amber-100 text-amber-700">TEST</span>}</td>
                  <td className="py-2 text-gray-600">{m.campaign?.name ?? "—"}</td>
                  <td className="py-2 text-gray-600">{m.templateVersion?.template?.name ?? "—"}</td>
                  <td className="py-2"><StatusBadge status={m.status} /></td>
                  <td className="py-2 text-gray-500">{new Date(m.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
