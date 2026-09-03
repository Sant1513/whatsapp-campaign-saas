import { requireTenant } from "@/lib/tenant";
import { maskPhone } from "@/lib/format";

export default async function ContactsPage() {
  const ctx = await requireTenant();
  const contacts = await ctx.db.contact.findMany({ orderBy: { updatedAt: "desc" }, take: 200 });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Contacts</h1>
      {contacts.length === 0 ? (
        <div className="card py-16 text-center text-sm text-gray-500">No contacts yet. Contacts are created from campaign imports or a dedicated import.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-gray-400">
              <tr><th className="pb-2">Name</th><th className="pb-2">Phone</th><th className="pb-2">Tags</th><th className="pb-2">Updated</th></tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-t border-gray-100">
                  <td className="py-2 font-medium">{c.name || "—"}</td>
                  <td className="py-2 font-mono">{maskPhone(c.phone)}</td>
                  <td className="py-2 text-gray-500">{c.tags.join(", ") || "—"}</td>
                  <td className="py-2 text-gray-500">{new Date(c.updatedAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
