import { requireTenant } from "@/lib/tenant";
import { AddConnectionForm } from "@/components/AddConnectionForm";

export default async function IntegrationsPage() {
  const ctx = await requireTenant();
  const [connections, definitions] = await Promise.all([
    ctx.db.serriConnection.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, endpoint: true, apiKeyLast4: true, status: true },
    }),
    ctx.db.campaignDefinition.findMany({ orderBy: { createdAt: "desc" } }),
  ]);
  const canManage = ctx.role === "ORG_ADMIN";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Integrations</h1>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500">Serri Connections</h2>
        {connections.length === 0 ? (
          <div className="card text-sm text-gray-500">No connections yet. Add one below to start sending.</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {connections.map((c) => (
              <div key={c.id} className="card">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{c.name}</p>
                  <span className={`badge ${c.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>{c.status === "ACTIVE" ? "Connected" : "Inactive"}</span>
                </div>
                <p className="mt-1 truncate text-xs text-gray-500">{c.endpoint}</p>
                <p className="mt-2 font-mono text-sm text-gray-700">API Key: ••••••••••••{c.apiKeyLast4}</p>
              </div>
            ))}
          </div>
        )}
        {canManage && <AddConnectionForm />}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-500">Serri Campaign Definitions</h2>
        {definitions.length === 0 ? (
          <div className="card text-sm text-gray-500">No campaign definitions yet.</div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-400">
                <tr><th className="pb-2">Name</th><th className="pb-2">Serri campaign</th><th className="pb-2">Type</th><th className="pb-2">Status</th></tr>
              </thead>
              <tbody>
                {definitions.map((d) => (
                  <tr key={d.id} className="border-t border-gray-100">
                    <td className="py-2">{d.name}</td>
                    <td className="py-2 font-mono text-xs">{d.serriCampaignName}</td>
                    <td className="py-2">{d.messageType}</td>
                    <td className="py-2">{d.status}</td>
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
