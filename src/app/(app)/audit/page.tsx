export const dynamic = "force-dynamic";
import { requireTenant } from "@/lib/tenant";

export default async function AuditPage() {
  const ctx = await requireTenant();
  const logs = await ctx.db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Audit Logs</h1>
      {logs.length === 0 ? (
        <div className="card py-16 text-center text-sm text-gray-500">No audit events yet.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr><th className="pb-2">Action</th><th className="pb-2">Entity</th><th className="pb-2">Metadata</th><th className="pb-2">When</th></tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-gray-100">
                  <td className="py-2 font-mono text-xs">{l.action}</td>
                  <td className="py-2 text-gray-600">{l.entityType ?? "—"}</td>
                  <td className="py-2 text-xs text-gray-500">{JSON.stringify(l.metadata)}</td>
                  <td className="py-2 text-gray-500">{new Date(l.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
