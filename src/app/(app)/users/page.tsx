import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

export default async function UsersPage() {
  const ctx = await requireTenant();
  const members = await prisma.organizationUser.findMany({
    where: { organizationId: ctx.organizationId },
    include: { user: { select: { name: true, email: true, status: true } } },
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Users & Teams</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-gray-400">
            <tr><th className="pb-2">Name</th><th className="pb-2">Email</th><th className="pb-2">Role</th><th className="pb-2">Status</th></tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-gray-100">
                <td className="py-2 font-medium">{m.user.name}</td>
                <td className="py-2 text-gray-600">{m.user.email}</td>
                <td className="py-2"><span className="badge bg-gray-100 text-gray-600">{m.role}</span></td>
                <td className="py-2 text-gray-500">{m.user.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ctx.role !== "ORG_ADMIN" && <p className="text-xs text-gray-400">Only Org Admins can manage users.</p>}
    </div>
  );
}
