export const dynamic = "force-dynamic";
import Link from "next/link";
import { requireTenant } from "@/lib/tenant";

export default async function TemplatesPage() {
  const ctx = await requireTenant();
  const templates = await ctx.db.template.findMany({
    where: { status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    include: { currentVersion: { include: { campaignDefinition: true } }, versions: true },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Templates</h1>
        <Link
          href="/templates/new"
          className="rounded-lg bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          + New Template
        </Link>
      </div>
      {templates.length === 0 ? (
        <div className="card py-16 text-center text-sm text-gray-500">
          No templates yet. Templates are created by an Org Admin and reference a Serri campaign definition.
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr><th className="pb-2">Template</th><th className="pb-2">Message Type</th><th className="pb-2">Serri Campaign</th><th className="pb-2">Version</th><th className="pb-2">Updated</th><th className="pb-2"></th></tr>
            </thead>
            <tbody>
              {templates.map((t: any) => (
                <tr key={t.id} className="border-t border-gray-100">
                  <td className="py-2 font-medium">{t.name}</td>
                  <td className="py-2">{t.currentVersion?.messageType ?? "—"}</td>
                  <td className="py-2 font-mono text-xs">{t.currentVersion?.campaignDefinition?.serriCampaignName ?? "—"}</td>
                  <td className="py-2">v{t.currentVersion?.version ?? "—"} <span className="text-xs text-gray-400">({t.versions.length} total)</span></td>
                  <td className="py-2 text-gray-500">{new Date(t.updatedAt).toLocaleDateString()}</td>
                  <td className="py-2 text-right"><Link href="/campaigns/new" className="text-brand-700 hover:underline">Create Campaign</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
