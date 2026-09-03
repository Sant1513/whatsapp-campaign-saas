import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";
import { env } from "@/lib/env";

export default async function SettingsPage() {
  const ctx = await requireTenant();
  const org = await prisma.organization.findUnique({ where: { id: ctx.organizationId } });

  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="card space-y-3 text-sm">
        <Row label="Organization" value={org?.name} />
        <Row label="Timezone" value={org?.timezone} />
        <Row label="Allow fallbacks by default" value={org?.allowFallbackByDefault ? "Yes" : "No"} />
        <Row label="Data retention (days)" value={String(org?.retentionDays)} />
        <Row label="Serri sending mode" value={env.SERRI_MODE === "live" ? "LIVE" : "Dry-run (safe)"} />
      </div>
      <p className="text-xs text-gray-400">
        Sending mode is controlled by the <code>SERRI_MODE</code> environment variable. In dry-run,
        payloads are fully built and validated but never transmitted to Serri.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between border-b border-gray-100 pb-2 last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );
}
