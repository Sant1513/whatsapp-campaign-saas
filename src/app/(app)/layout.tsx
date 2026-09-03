import { redirect } from "next/navigation";
import { requireTenant, listMemberships } from "@/lib/tenant";
import { Sidebar } from "@/components/Sidebar";
import { TopBar } from "@/components/TopBar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await requireTenant();
  } catch {
    redirect("/login");
  }
  const memberships = await listMemberships(ctx.userId);
  const active = memberships.find((m) => m.organizationId === ctx.organizationId);

  return (
    <div className="flex min-h-screen">
      <Sidebar role={ctx.role} isSuperAdmin={ctx.isSuperAdmin} />
      <div className="flex flex-1 flex-col">
        <TopBar
          role={ctx.role}
          orgName={active?.organization.name ?? "Organization"}
          organizations={memberships.map((m) => ({ id: m.organizationId, name: m.organization.name }))}
          activeOrgId={ctx.organizationId}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
